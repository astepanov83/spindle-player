// The library process (an Electron utilityProcess). It owns the index: reads and
// writes library.json, scans the music folders, groups albums, and hands main
// the page's library as ready JSON bytes. Main only forwards, so a 50k library
// never blocks it. Its own process means its own libuv pool: slow NAS reads here
// can't hold up main's audio requests and saves.
import { hash } from 'crypto'
import { readdir, readFile, rm, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import type { ScanStatus } from '../../shared/library'
import { JsonFileWriter, readJsonFile } from '../json-file'
import { buildLibrary, type BuiltLibrary } from './group'
import { eachPaced, Pacer, scanSlow } from './pacer'
import { decodeCue, parseCue } from './cue'
import { probeTags } from './probe'
import { readTags } from './read-tags'
import {
  applyBatch,
  applyCue,
  applyListing,
  dirOf,
  emptiedFolders,
  emptyIndex,
  isUnder,
  missingPalettes,
  parseIndex,
  planCueReads,
  planReads,
  prunePalettes,
  readAgainWithProbe,
  serializeIndex,
  usedCovers
} from './merge'
import { extOf, frontCover, normalizeTags } from './tags'
import { walk } from './walk'
import { pruneCoverFiles } from './cover-prune'
import { ownCopy } from './bytes'
import { markerOf, smallName } from './cover-names'
import {
  readerVersion,
  type CueEntry,
  type FileEntry,
  type FolderImage,
  type LibraryIndex,
  type MediaInfo,
  type WorkerIn,
  type WorkerOut,
  type WorkerStart
} from './types'

const port = process.parentPort
// from main's first message; nothing else runs before it comes
let start: WorkerStart

// Disk jobs at once: folder listings, stats, and tag or image reads. Reading is
// mostly waiting on the disk, so a few at once is faster when nothing plays.
// While a song plays, one at a time, and reads rest after each, so a NAS link
// is left for the audio.
const dirPace = new Pacer(8, 1, false)
const statPace = new Pacer(16, 2, false)
const readPace = new Pacer(4, 1, true)

let playing = false
let playingDev: number | undefined
// devices of the music folders being scanned
let scannedDevs = new Set<number>()

function setPace(): void {
  const slow = scanSlow(playing, playingDev, scannedDevs)
  for (const p of [dirPace, statPace, readPace]) p.setSlow(slow)
}

async function devicesOf(folders: string[]): Promise<Set<number>> {
  const out = new Set<number>()
  for (const f of folders) {
    try {
      out.add((await stat(f)).dev)
    } catch {
      // not found; the walk reports it
    }
  }
  return out
}

// Pictures sent to main and not yet written, so a big first scan doesn't pile them up.
const coversAtOnce = 16
// While the first scan of an empty library runs, the page gets what is found this often.
const interimMs = 15000

function post(msg: WorkerOut): void {
  port.postMessage(msg)
}

function log(text: string): void {
  post({ type: 'log', text })
}

// --- state ---

let ix: LibraryIndex = emptyIndex()
let built: BuiltLibrary = { data: { albums: [], tracks: [] }, paths: new Map() }
// the index changed since the page last got the library
let dirty = false
let status: ScanStatus = {
  folders: [],
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

// bumped on every change to the index
let ixEdits = 0

function markChanged(): void {
  ixEdits++
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
  post({ type: 'library', bytes: encodeLibrary() })
}

// One line, since the index can be tens of MB. The writer keeps one write at a
// time and drops a write that a newer one replaced; flushSync is for quitting.
let writer: JsonFileWriter<unknown> | undefined
const makeWriter = (): JsonFileWriter<unknown> =>
  new JsonFileWriter<unknown>(
    start.indexPath,
    1000,
    (e) => log(`Could not save the library index: ${e}`),
    0
  )

// set once main asked for the last save before quitting
let closing = false

function saveIndex(): void {
  if (!unsaved || closing || !writer) return
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
  post({ type: 'cover', hash: h, data: ownCopy(data) })
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
      data = new Uint8Array(await readFile(join(start.coversDir, smallName(h))))
    } catch {
      // pruned or deleted meanwhile; the file is read again when its cover is missing
      claimed.delete(h)
      continue
    }
    sent.add(h)
    post({ type: 'cover', hash: h, data, paletteOnly: true })
  }
}

async function loadCached(): Promise<void> {
  try {
    for (const name of await readdir(start.coversDir)) {
      const m = markerOf(name)
      if (m) (m.bad ? bad : cached).add(m.hash)
    }
  } catch {
    // no cache yet
  }
}

// The covers the index uses, made again only after the index changed.
let usedCache: { edits: number; used: Set<string> } | undefined
function liveUsed(): Set<string> {
  if (usedCache?.edits !== ixEdits) usedCache = { edits: ixEdits, used: usedCovers(ix) }
  return usedCache.used
}

// The last prune. A scan starts only once it is done, so a prune never deletes
// a cover that a newer scan made or is making.
let pruning: Promise<void> = Promise.resolve()

// Deletes covers nothing points at any more, and their palettes. It stops when
// a newer scan is asked for; that scan prunes when it ends.
async function pruneCovers(gen: number): Promise<void> {
  const stale = (): boolean => gen !== scanGen
  if (stale()) return
  // palettes don't change what the page shows, so only the file needs saving
  if (prunePalettes(ix, liveUsed())) {
    unsaved = true
    saveIndex()
  }
  await pruneCoverFiles({
    dir: start.coversDir,
    used: liveUsed,
    busy: (h) => claimed.has(h),
    stale,
    forget: (h) => {
      cached.delete(h)
      bad.delete(h)
    }
  })
}

// --- scan ---

// Bumped by every scan; a scan that sees a newer number stops.
let scanGen = 0
class Stopped extends Error {}
function checkGen(gen: number): void {
  if (gen !== scanGen) throw new Stopped()
}

async function readFileEntry(
  path: string,
  mtime: number,
  size: number,
  gen: number
): Promise<FileEntry> {
  let meta
  try {
    meta = await readTags(path, { probe })
  } catch (error) {
    // listed by its file and folder names; tried again on a Rescan or once it changes
    return { path, mtime, size, duration: 0, error: String((error as Error)?.message ?? error) }
  }
  const entry: FileEntry = { path, mtime, size, ...normalizeTags(meta, extOf(path)) }
  const pic = frontCover(meta.common.picture)
  if (pic?.data.length) entry.cover = await sendCover(pic.data, gen)
  return entry
}

// ffprobe, once main said where it is
const probe = (path: string): ReturnType<typeof probeTags> =>
  start.ffprobe ? probeTags(start.ffprobe, path) : Promise.reject(new Error('no ffprobe'))

// Cue sheets are a few KB. One that can't be read or has no audio tracks is
// kept without a sheet, so it isn't read again until it changes.
async function readCue(f: { path: string; mtime: number; size: number }): Promise<CueEntry> {
  const c: CueEntry = { ...f }
  try {
    // a "cue" of megabytes is not a cue sheet
    if (f.size <= 1024 * 1024) {
      const sheet = parseCue(decodeCue(new Uint8Array(await readFile(f.path))))
      if (sheet) c.sheet = sheet
    }
  } catch {
    // gone or unreadable: no sheet; the image is listed as one song
  }
  return c
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

// Only the phases that finished: a scan that failed part way has fewer.
function phaseTimes(took: number[]): string {
  return took.map((ms, i) => `${['listing', 'sizes and images', 'tags'][i]} ${ms}`).join(', ')
}

async function scan(folders: string[], retryFailed: boolean, gen: number): Promise<void> {
  const t0 = performance.now()
  // ms spent listing, getting sizes, and reading, for the log
  const took: number[] = []
  const lap = (): void =>
    void took.push(Math.round(performance.now() - t0 - took.reduce((a, b) => a + b, 0)))
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
    scannedDevs = await devicesOf(folders)
    setPace()
    const listing = await walk(
      folders,
      dirPace,
      () => checkGen(gen),
      (files) => progress('walk', files, 0)
    )
    lap()
    progress('walk', listing.files.length, 0, true)

    const found: { path: string; mtime: number; size: number }[] = []
    const cues: typeof found = []
    const cueSet = new Set(listing.cues)
    await eachPaced([...listing.files, ...listing.cues], statPace, async (path) => {
      checkGen(gen)
      try {
        const s = await stat(path)
        ;(cueSet.has(path) ? cues : found).push({
          path,
          mtime: Math.floor(s.mtimeMs),
          size: s.size
        })
      } catch {
        // gone since the walk
      }
    })

    const images: FolderImage[] = []
    await eachPaced(listing.images, readPace, async (path) => {
      checkGen(gen)
      const im = await readImage(path, ix.images.get(dirOf(path)), gen)
      if (im) images.push(im)
    })

    lap()
    checkGen(gen)
    // entries an older tag reader got wrong are read once more with ffprobe
    const newReader = !!start.ffprobe && ix.reader < readerVersion
    const toRead = planReads(
      ix.files,
      found,
      known,
      retryFailed,
      newReader ? readAgainWithProbe : undefined
    )
    const cuesToRead = planCueReads(ix.cues, cues, retryFailed)
    const skipped = [...listing.skipped, ...emptiedFolders(ix, folders, listing.files)]
    if (
      applyListing(ix, folders, {
        paths: found.map((f) => f.path),
        cues: cues.map((c) => c.path),
        images,
        skipped
      })
    )
      markChanged()
    setStatus({ missing: folders.filter((f) => skipped.some((s) => isUnder(f, s))) })

    await eachPaced(cuesToRead, readPace, async (f) => {
      checkGen(gen)
      const c = await readCue(f)
      checkGen(gen)
      if (applyCue(ix, c)) markChanged()
    })

    const byPath = new Map(found.map((f) => [f.path, f]))
    progress('read', 0, toRead.length, true)
    await eachPaced(toRead, readPace, async (path) => {
      checkGen(gen)
      const f = byPath.get(path)!
      const entry = await readFileEntry(path, f.mtime, f.size, gen)
      checkGen(gen)
      if (applyBatch(ix, [entry])) markChanged()
      read++
      progress('read', read, toRead.length)
    })
    progress('read', read, toRead.length, true)
    if (newReader) {
      ix.reader = readerVersion
      unsaved = true
    }
    lap()
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
    `Library scan: ${Math.round(performance.now() - t0)} ms (${phaseTimes(took)}), ` +
      `${read} files read, ` +
      `${status.tracks} songs in ${status.albums} albums`
  )
  pruning = pruneCovers(gen).catch((e) => log(`Could not prune covers: ${e}`))
  await pruning
}

// --- lookups for the protocol ---

async function coverSource(h: string): Promise<Uint8Array | undefined> {
  for (const im of ix.images.values()) if (im.cover === h) return readFile(im.path)
  for (const e of ix.files.values()) {
    if (e.cover !== h) continue
    const meta = await readTags(e.path)
    return frontCover(meta.common.picture)?.data
  }
  return undefined
}

// What main needs to serve a file by its id.
function mediaInfo(id: string): MediaInfo | undefined {
  const path = built.paths.get(id)
  const e = path ? ix.files.get(path) : undefined
  if (!e) return undefined
  const { codec, duration, sampleRate, channels, bits } = e
  return { path: e.path, codec, duration, sampleRate, channels, bits }
}

port.on('message', (e: Electron.MessageEvent) => {
  const m = e.data as WorkerIn
  switch (m.type) {
    case 'start':
      started(m.start)
      break
    case 'scan': {
      if (closing) break
      const gen = ++scanGen
      // let a stopped scan's waits wake up and see the new number
      wakeCoverWaiters()
      ready
        .then(() => pruning)
        .then(() => scan(m.folders, m.retryFailed, gen))
        .catch((e) => log(`Library scan failed: ${e}`))
      break
    }
    case 'playing':
      playing = m.playing
      playingDev = m.dev
      setPace()
      break
    case 'stop':
      ++scanGen
      wakeCoverWaiters()
      break
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
        () => post({ type: 'reply', req: m.req, media: mediaInfo(m.id) }),
        () => post({ type: 'reply', req: m.req })
      )
      break
    case 'get-library':
      ready.then(
        () => post({ type: 'reply', req: m.req, data: encodeLibrary() }),
        () => post({ type: 'reply', req: m.req })
      )
      break
    case 'flush':
      // quitting: main waits for the answer a short while, then this process ends
      saveIndex()
      writer?.flushSync()
      closing = true
      ++scanGen
      wakeCoverWaiters()
      post({ type: 'flushed' })
      break
    case 'cover-source':
      ready
        .then(() => coverSource(m.hash))
        .then(
          (data) => post({ type: 'reply', req: m.req, data: data && ownCopy(data) }),
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

// Reads the index and groups it once main sent the start data; main asks for
// the library with 'get-library'.
let started: (s: WorkerStart) => void
const ready = new Promise<WorkerStart>((r) => (started = r)).then(async (s) => {
  start = s
  writer = makeWriter()
  status = { ...status, folders: s.folders }
  await removeStrayTemp()
  await loadCached()
  const r = readJsonFile(start.indexPath)
  // the index is only a cache of the music files, so it is made again either way
  if (r.kind === 'broken' || r.kind === 'unreadable')
    log(`Library index is ${r.kind}, scanning again: ${start.indexPath}`)
  ix = parseIndex(r.kind === 'ok' ? r.value : undefined)
  ixEdits++
  build()
})
