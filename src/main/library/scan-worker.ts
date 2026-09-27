// Runs in a worker thread: walks the music folders, reads tags of new and
// changed files, and hands pictures to main for the cover cache.
// Main keeps the index; this only reports what it found.
import { createHash } from 'crypto'
import { readdir, readFile, realpath, stat } from 'fs/promises'
import { join } from 'path'
import { parentPort, workerData } from 'worker_threads'
import { parseFile } from 'music-metadata'
import { dirOf, planReads } from './merge'
import { extOf, frontCover, isAudioFile, normalizeTags, pickFolderImage } from './tags'
import type { FileEntry, FolderImage, MainMessage, WorkerMessage, WorkerStart } from './types'

const port = parentPort!
const start = workerData as WorkerStart

// Tag reading is mostly waiting on the disk, so a few files at once is faster.
// More than this only adds memory.
const readAtOnce = 8
const statAtOnce = 32
// Pictures sent to main and not yet written, so a big first scan doesn't pile them up.
const coversAtOnce = 16

function post(msg: WorkerMessage, transfer: ArrayBuffer[] = []): void {
  port.postMessage(msg, transfer)
}

// Runs fn over items, at most n at a time.
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const run = async (): Promise<void> => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run))
}

let lastProgress = 0
function progress(phase: 'walk' | 'read', done: number, total: number, force = false): void {
  const now = Date.now()
  if (!force && now - lastProgress < 100) return
  lastProgress = now
  post({ type: 'progress', phase, done, total })
}

// --- cover cache ---

const cached = new Set<string>()
let coversOut = 0
let coverWaiters: (() => void)[] = []

port.on('message', (m: MainMessage) => {
  if (m.type !== 'cover-done') return
  coversOut--
  const w = coverWaiters
  coverWaiters = []
  for (const f of w) f()
})

async function sendCover(data: Uint8Array): Promise<string> {
  const hash = createHash('sha1').update(data).digest('hex')
  if (cached.has(hash)) return hash
  cached.add(hash)
  while (coversOut >= coversAtOnce) await new Promise<void>((r) => coverWaiters.push(r))
  coversOut++
  // a copy of its own, so the buffer can move to main without a second copy
  const copy = data.slice()
  post({ type: 'cover', hash, data: copy }, [copy.buffer])
  return hash
}

async function loadCached(): Promise<void> {
  try {
    for (const name of await readdir(start.coversDir)) {
      // "<hash>.jpg", or "<hash>.bad" for a picture that could not be decoded
      const m = /^([0-9a-f]{40})\.(jpg|bad)$/.exec(name)
      if (m) cached.add(m[1])
    }
  } catch {
    // no cache yet
  }
}

// --- walk ---

interface Listing {
  files: string[]
  images: string[]
  skipped: string[]
}

async function walk(roots: string[]): Promise<Listing> {
  const out: Listing = { files: [], images: [], skipped: [] }
  const seenFiles = new Set<string>()
  // real paths, so a symlink loop is walked once
  const seenDirs = new Set<string>()
  let queue = [...roots]
  while (queue.length) {
    const next: string[] = []
    await pool(queue, 16, async (dir) => {
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

// --- read ---

async function readFileEntry(path: string, mtime: number, size: number): Promise<FileEntry> {
  try {
    // A full duration count reads the whole file for an mp3 with no header,
    // so mp3 gets the quick estimate. Ogg needs it to report any duration at all.
    const mp3 = extOf(path) === 'mp3'
    let meta = await parseFile(path, { skipCovers: false, duration: !mp3 })
    if (mp3 && !meta.format.duration)
      meta = await parseFile(path, { skipCovers: false, duration: true })
    const entry: FileEntry = { path, mtime, size, ...normalizeTags(meta) }
    const pic = frontCover(meta.common.picture)
    if (pic?.data.length) entry.cover = await sendCover(pic.data)
    return entry
  } catch (error) {
    return { path, mtime, size, duration: 0, error: String((error as Error)?.message ?? error) }
  }
}

async function readImage(
  path: string,
  known: FolderImage | undefined
): Promise<FolderImage | undefined> {
  try {
    const s = await stat(path)
    const mtime = Math.floor(s.mtimeMs)
    if (
      known &&
      known.path === path &&
      known.mtime === mtime &&
      known.size === s.size &&
      known.cover &&
      cached.has(known.cover)
    )
      return known
    const cover = await sendCover(await readFile(path))
    return { path, mtime, size: s.size, cover }
  } catch {
    return undefined
  }
}

async function main(): Promise<void> {
  await loadCached()
  const listing = await walk(start.folders)
  progress('walk', listing.files.length, 0, true)

  const found: { path: string; mtime: number; size: number }[] = []
  await pool(listing.files, statAtOnce, async (path) => {
    try {
      const s = await stat(path)
      found.push({ path, mtime: Math.floor(s.mtimeMs), size: s.size })
    } catch {
      // gone since the walk
    }
  })

  const knownImages = new Map(start.images.map((im) => [dirOf(im.path), im]))
  const images: FolderImage[] = []
  await pool(listing.images, statAtOnce, async (path) => {
    const im = await readImage(path, knownImages.get(dirOf(path)))
    if (im) images.push(im)
  })

  post({
    type: 'listing',
    paths: found.map((f) => f.path),
    images,
    skipped: listing.skipped
  })

  const known = new Map(
    start.known.map(([p, m, s, c]) => [p, [m, s, c] as [number, number, string]])
  )
  const byPath = new Map(found.map((f) => [f.path, f]))
  const toRead = planReads(known, found, (h) => cached.has(h))

  let done = 0
  let failed = 0
  let batch: FileEntry[] = []
  let lastBatch = Date.now()
  const flush = (): void => {
    if (batch.length) post({ type: 'batch', entries: batch })
    batch = []
    lastBatch = Date.now()
  }
  progress('read', 0, toRead.length, true)
  await pool(toRead, readAtOnce, async (path) => {
    const f = byPath.get(path)!
    const entry = await readFileEntry(path, f.mtime, f.size)
    if (entry.error) failed++
    batch.push(entry)
    done++
    if (batch.length >= 500 || Date.now() - lastBatch > 1000) flush()
    progress('read', done, toRead.length)
  })
  flush()
  progress('read', done, toRead.length, true)
  // wait until main has every picture, so the covers are there when it builds albums
  while (coversOut > 0) await new Promise<void>((r) => coverWaiters.push(r))
  post({ type: 'done', failed })
}

main().catch((error) => {
  // let main see it as a worker error
  setImmediate(() => {
    throw error
  })
})
