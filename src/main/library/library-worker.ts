// The library worker thread. It owns the index: reads and writes library.json,
// scans the music folders, groups albums, and hands main the page's library as
// ready JSON bytes. Main only forwards, so a 50k library never blocks it.
import { hash } from 'crypto'
import { readdir, readFile, realpath, rm, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { parentPort, workerData } from 'worker_threads'
import { parseFile } from 'music-metadata'
import type { ScanStatus } from '../../shared/library'
import { JsonFileWriter, readJsonFile } from '../json-file'
import { buildLibrary, type BuiltLibrary } from './group'
import {
  applyBatch,
  applyListing,
  dirOf,
  emptyIndex,
  isUnder,
  missingPalettes,
  parseIndex,
  planReads,
  prunePalettes,
  serializeIndex,
  usedCovers
} from './merge'
import { extOf, frontCover, isAudioFile, normalizeTags, pickFolderImage } from './tags'
import type {
  FileEntry,
  FolderImage,
  LibraryIndex,
  WorkerIn,
  WorkerOut,
  WorkerStart
} from './types'

const port = parentPort!
const start = workerData as WorkerStart

// Tag reading is mostly waiting on the disk, so a few files at once is faster.
// More than this only adds memory.
const readAtOnce = 8
const statAtOnce = 32
// Pictures sent to main and not yet written, so a big first scan doesn't pile them up.
const coversAtOnce = 16
// While the first scan of an empty library runs, the page gets what is found this often.
const interimMs = 15000

function post(msg: WorkerOut, transfer: ArrayBuffer[] = []): void {
  port.postMessage(msg, transfer)
}

function log(text: string): void {
  post({ type: 'log', text })
}

// Runs fn over items, at most n at a time.
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const run = async (): Promise<void> => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run))
}

// --- state ---

let ix: LibraryIndex = emptyIndex()
let built: BuiltLibrary = { data: { albums: [], tracks: [] }, paths: new Map() }
// the index changed since the page last got the library
let dirty = false
let status: ScanStatus = {
  folders: start.folders,
  phase: 'idle',
  done: 0,
  total: 0,
  tracks: 0,
  albums: 0,
  failed: 0,
  missing: []
}

function setStatus(change: Partial<ScanStatus>): void {
  status = { ...status, ...change }
  post({ type: 'status', status })
}

let lastProgress = 0
function progress(phase: 'walk' | 'read', done: number, total: number, force = false): void {
  const now = Date.now()
  if (!force && now - lastProgress < 100) return
  lastProgress = now
  setStatus({ phase, done, total })
}

// the index changed since it was last handed to the writer
let unsaved = false

function markChanged(): void {
  dirty = true
  unsaved = true
}

// Groups albums, for the page and the lookups.
function build(): void {
  dirty = false
  built = buildLibrary(ix, (h) => cached.has(h))
  let failed = 0
  for (const e of ix.files.values()) if (e.error) failed++
  setStatus({ tracks: built.data.tracks.length, albums: built.data.albums.length, failed })
}

function encodeLibrary(): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(built.data))
}

// Groups albums and sends them to the page as JSON bytes.
function publish(): void {
  build()
  const bytes = encodeLibrary()
  post({ type: 'library', bytes }, [bytes.buffer as ArrayBuffer])
}

// One line, since the index can be tens of MB. The writer keeps one write at a
// time and drops a write that a newer one replaced; flushSync is for quitting.
const writer = new JsonFileWriter<unknown>(
  start.indexPath,
  1000,
  (e) => log(`Could not save the library index: ${e}`),
  0
)

function saveIndex(): void {
  if (!unsaved) return
  unsaved = false
  writer.schedule(serializeIndex(ix))
}

// --- cover cache ---

// "<hash>.jpg" made, "<hash>.bad" could not be decoded, sent: waiting for main.
// claimed: sent, or waiting for a free slot. It is taken before any wait, so two
// files with the same picture never send it twice (two writes to one file).
const cached = new Set<string>()
const bad = new Set<string>()
const sent = new Set<string>()
const claimed = new Set<string>()
let coverWaiters: (() => void)[] = []

function wakeCoverWaiters(): void {
  const w = coverWaiters
  coverWaiters = []
  for (const f of w) f()
}

const known = (h: string): boolean => cached.has(h) || bad.has(h)

async function sendCover(data: Uint8Array, gen: number): Promise<string> {
  const h = hash('sha1', data)
  if (known(h) || claimed.has(h)) return h
  claimed.add(h)
  await waitForSlot(h, gen)
  sent.add(h)
  // a copy of its own, so the buffer can move to main without a second copy
  const copy = data.slice()
  post({ type: 'cover', hash: h, data: copy }, [copy.buffer])
  return h
}

// Waits for a free slot to send a picture to main. The hash must be claimed first.
async function waitForSlot(h: string, gen: number): Promise<void> {
  try {
    while (sent.size >= coversAtOnce) {
      await new Promise<void>((r) => coverWaiters.push(r))
      checkGen(gen)
    }
  } catch (e) {
    claimed.delete(h)
    throw e
  }
}

// Covers cached before palettes were picked (an index from before 009, or a
// quit before the index was saved) get one from the small cover, so no music
// file is read again.
async function fillPalettes(gen: number): Promise<void> {
  for (const h of missingPalettes(ix, (x) => cached.has(x))) {
    if (claimed.has(h)) continue
    claimed.add(h)
    await waitForSlot(h, gen)
    let data: Uint8Array
    try {
      data = new Uint8Array(await readFile(join(start.coversDir, `${h}.jpg`)))
    } catch {
      // pruned or deleted meanwhile; the file is read again when its cover is missing
      claimed.delete(h)
      continue
    }
    sent.add(h)
    post({ type: 'cover', hash: h, data, paletteOnly: true }, [data.buffer as ArrayBuffer])
  }
}

async function loadCached(): Promise<void> {
  try {
    for (const name of await readdir(start.coversDir)) {
      const m = /^([0-9a-f]{40})\.(jpg|bad)$/.exec(name)
      if (m) (m[2] === 'jpg' ? cached : bad).add(m[1])
    }
  } catch {
    // no cache yet
  }
}

// Deletes covers nothing points at any more, and their palettes.
async function pruneCovers(): Promise<void> {
  const used = usedCovers(ix)
  // palettes don't change what the page shows, so only the file needs saving
  if (prunePalettes(ix, used)) {
    unsaved = true
    saveIndex()
  }
  let names: string[]
  try {
    names = await readdir(start.coversDir)
  } catch {
    return
  }
  for (const name of names) {
    const h = name.slice(0, 40)
    if (!/^[0-9a-f]{40}$/.test(h) || used.has(h) || claimed.has(h)) continue
    cached.delete(h)
    bad.delete(h)
    await rm(join(start.coversDir, name), { force: true })
  }
}

// --- scan ---

// Bumped by every scan; a scan that sees a newer number stops.
let scanGen = 0
class Stopped extends Error {}
function checkGen(gen: number): void {
  if (gen !== scanGen) throw new Stopped()
}

interface Listing {
  files: string[]
  images: string[]
  skipped: string[]
}

async function walk(roots: string[], gen: number): Promise<Listing> {
  const out: Listing = { files: [], images: [], skipped: [] }
  const seenFiles = new Set<string>()
  // real paths, so a symlink loop is walked once
  const seenDirs = new Set<string>()
  let queue = [...roots]
  while (queue.length) {
    const next: string[] = []
    await pool(queue, 16, async (dir) => {
      checkGen(gen)
      let entries
      try {
        const real = await realpath(dir)
        if (seenDirs.has(real)) return
        seenDirs.add(real)
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        out.skipped.push(dir)
        return
      }
      const names: string[] = []
      for (const d of entries) {
        if (d.name.startsWith('.')) continue
        const path = join(dir, d.name)
        let isDir = d.isDirectory()
        let isFile = d.isFile()
        if (d.isSymbolicLink()) {
          try {
            const s = await stat(path)
            isDir = s.isDirectory()
            isFile = s.isFile()
          } catch {
            continue
          }
        }
        if (isDir) next.push(path)
        else if (isFile) {
          names.push(d.name)
          if (isAudioFile(d.name) && !seenFiles.has(path)) {
            seenFiles.add(path)
            out.files.push(path)
          }
        }
      }
      const image = pickFolderImage(names)
      if (image) out.images.push(join(dir, image))
      progress('walk', out.files.length, 0)
    })
    queue = next
  }
  return out
}

async function readFileEntry(
  path: string,
  mtime: number,
  size: number,
  gen: number
): Promise<FileEntry> {
  let meta
  try {
    // A full duration count reads the whole file for an mp3 with no header,
    // so mp3 gets the quick estimate. Ogg needs it to report any duration at all.
    const mp3 = extOf(path) === 'mp3'
    meta = await parseFile(path, { skipCovers: false, duration: !mp3 })
    if (mp3 && !meta.format.duration)
      meta = await parseFile(path, { skipCovers: false, duration: true })
  } catch (error) {
    return { path, mtime, size, duration: 0, error: String((error as Error)?.message ?? error) }
  }
  const entry: FileEntry = { path, mtime, size, ...normalizeTags(meta) }
  const pic = frontCover(meta.common.picture)
  if (pic?.data.length) entry.cover = await sendCover(pic.data, gen)
  return entry
}

async function readImage(
  path: string,
  old: FolderImage | undefined,
  gen: number
): Promise<FolderImage | undefined> {
  let s
  let data
  try {
    s = await stat(path)
    const mtime = Math.floor(s.mtimeMs)
    if (old && old.path === path && old.mtime === mtime && old.size === s.size && known(old.cover))
      return old
    data = await readFile(path)
  } catch {
    return undefined
  }
  const cover = await sendCover(data, gen)
  return { path, mtime: Math.floor(s.mtimeMs), size: s.size, cover }
}

async function scan(folders: string[], gen: number): Promise<void> {
  const t0 = performance.now()
  const firstFill = ix.files.size === 0
  // While scanning: save what was read so far, so a quit or crash keeps it.
  // A first scan also shows it, so an empty library fills in as it goes.
  const interim = setInterval(() => {
    if (firstFill && dirty) publish()
    saveIndex()
  }, interimMs)
  let read = 0
  try {
    setStatus({ folders, phase: 'walk', done: 0, total: 0, missing: [] })
    const listing = await walk(folders, gen)
    progress('walk', listing.files.length, 0, true)

    const found: { path: string; mtime: number; size: number }[] = []
    await pool(listing.files, statAtOnce, async (path) => {
      checkGen(gen)
      try {
        const s = await stat(path)
        found.push({ path, mtime: Math.floor(s.mtimeMs), size: s.size })
      } catch {
        // gone since the walk
      }
    })

    const images: FolderImage[] = []
    await pool(listing.images, statAtOnce, async (path) => {
      checkGen(gen)
      const im = await readImage(path, ix.images.get(dirOf(path)), gen)
      if (im) images.push(im)
    })

    checkGen(gen)
    const toRead = planReads(ix.files, found, known)
    if (
      applyListing(ix, folders, {
        paths: found.map((f) => f.path),
        images,
        skipped: listing.skipped
      })
    )
      markChanged()
    setStatus({ missing: folders.filter((f) => listing.skipped.some((s) => isUnder(f, s))) })

    const byPath = new Map(found.map((f) => [f.path, f]))
    progress('read', 0, toRead.length, true)
    await pool(toRead, readAtOnce, async (path) => {
      checkGen(gen)
      const f = byPath.get(path)!
      const entry = await readFileEntry(path, f.mtime, f.size, gen)
      checkGen(gen)
      if (applyBatch(ix, [entry])) markChanged()
      read++
      progress('read', read, toRead.length)
    })
    progress('read', read, toRead.length, true)
    await fillPalettes(gen)
    // wait until main has every picture, so the covers are there for the albums
    while (sent.size > 0) {
      await new Promise<void>((r) => coverWaiters.push(r))
      checkGen(gen)
    }
  } catch (error) {
    if (!(error instanceof Stopped)) log(`Library scan failed: ${error}`)
    // a stopped scan keeps what it read; the next one carries on from there
    if (error instanceof Stopped) {
      saveIndex()
      return
    }
  } finally {
    clearInterval(interim)
  }
  if (dirty) publish()
  saveIndex()
  setStatus({ phase: 'idle', done: 0, total: 0 })
  log(
    `Library scan: ${Math.round(performance.now() - t0)} ms, ${read} files read, ` +
      `${status.tracks} songs in ${status.albums} albums`
  )
  await pruneCovers()
}

// --- lookups for the protocol ---

async function coverSource(h: string): Promise<Uint8Array | undefined> {
  for (const im of ix.images.values()) if (im.cover === h) return readFile(im.path)
  for (const e of ix.files.values()) {
    if (e.cover !== h) continue
    const meta = await parseFile(e.path, { skipCovers: false })
    return frontCover(meta.common.picture)?.data
  }
  return undefined
}

port.on('message', (m: WorkerIn) => {
  switch (m.type) {
    case 'scan': {
      const gen = ++scanGen
      // let a stopped scan's waits wake up and see the new number
      wakeCoverWaiters()
      ready.then(() => scan(m.folders, gen)).catch((e) => log(`Library scan failed: ${e}`))
      break
    }
    case 'cover-done':
      sent.delete(m.hash)
      claimed.delete(m.hash)
      // "retry" stays unknown, so the next scan reads that file again
      if (m.result === 'ok') cached.add(m.hash)
      else if (m.result === 'bad') bad.add(m.hash)
      else if (m.result === 'rebuild') {
        // the next scan reads the file or image again, since its cover is gone
        cached.delete(m.hash)
        markChanged()
      }
      if (m.palette) {
        ix.palettes.set(m.hash, m.palette)
        markChanged()
      }
      wakeCoverWaiters()
      break
    case 'find-track':
      ready.then(
        () => post({ type: 'reply', req: m.req, path: built.paths.get(m.id) }),
        () => post({ type: 'reply', req: m.req })
      )
      break
    case 'get-library':
      ready.then(
        () => {
          const data = encodeLibrary()
          post({ type: 'reply', req: m.req, data }, [data.buffer as ArrayBuffer])
        },
        () => post({ type: 'reply', req: m.req })
      )
      break
    case 'flush': {
      // quitting: main waits on the flag for a short while, so write now
      saveIndex()
      writer.flushSync()
      const flag = new Int32Array(start.flushFlag)
      Atomics.store(flag, 0, 1)
      Atomics.notify(flag, 0)
      break
    }
    case 'cover-source':
      ready
        .then(() => coverSource(m.hash))
        .then(
          (data) => {
            const copy = data?.slice()
            post({ type: 'reply', req: m.req, data: copy }, copy ? [copy.buffer] : [])
          },
          () => post({ type: 'reply', req: m.req })
        )
      break
  }
})

// Temp files left by a quit or crash in the middle of a write.
async function removeStrayTemp(): Promise<void> {
  const dir = dirname(start.indexPath)
  const index = basename(start.indexPath)
  for (const [d, match] of [
    [dir, (n: string) => n.startsWith(index + '.') && n.endsWith('.tmp')],
    [start.coversDir, (n: string) => n.endsWith('.tmp')]
  ] as const) {
    try {
      for (const n of await readdir(d)) if (match(n)) await rm(join(d, n), { force: true })
    } catch {
      // no folder yet
    }
  }
}

// Reads the index and groups it; main asks for the library with 'get-library'.
const ready = (async () => {
  await removeStrayTemp()
  await loadCached()
  const r = readJsonFile(start.indexPath)
  // the index is only a cache of the music files, so it is made again either way
  if (r.kind === 'broken' || r.kind === 'unreadable')
    log(`Library index is ${r.kind}, scanning again: ${start.indexPath}`)
  ix = parseIndex(r.kind === 'ok' ? r.value : undefined)
  build()
})()
