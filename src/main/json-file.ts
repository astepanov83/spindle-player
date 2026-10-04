// JSON files in userData: settings, the library index, playlists and the queue.
import {
  closeSync,
  copyFileSync,
  fsyncSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync
} from 'fs'
import { open, rename, rm } from 'fs/promises'
import { basename, dirname, join } from 'path'

// broken: read fine but not JSON. unreadable: the read itself failed (EACCES,
// EIO, EISDIR...), so nothing is known about what is in it.
export type ReadResult =
  | { kind: 'ok'; value: unknown }
  | { kind: 'missing' }
  | { kind: 'broken'; error: unknown }
  | { kind: 'unreadable'; error: unknown }

export function readJsonFile(path: string): ReadResult {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' }
    return { kind: 'unreadable', error }
  }
  try {
    return { kind: 'ok', value: JSON.parse(text) }
  } catch (error) {
    return { kind: 'broken', error }
  }
}

export interface OpenedFile {
  // undefined when there is nothing usable; the caller starts from defaults
  value: unknown
  // false when the file must not be replaced this session
  canWrite: boolean
}

// Reads a file the app saves again later. Whatever the next save would lose is
// kept first: a file that is not JSON goes to "<name>.broken", JSON in a shape
// or version this build doesn't know goes to "<name>.unknown". A file that can't
// be read at all is never written this session, since it may still be fine.
// If the copy fails, the file is not written either.
export function openJsonFile(
  path: string,
  what: string,
  known: (value: unknown) => boolean
): OpenedFile {
  const read = readJsonFile(path)
  switch (read.kind) {
    case 'missing':
      return { value: undefined, canWrite: true }
    case 'unreadable':
      console.error(`${what} can't be read; using defaults and not saving it: ${path}`, read.error)
      return { value: undefined, canWrite: false }
    case 'broken':
      console.error(`${what} is broken, starting fresh: ${path}`, read.error)
      return { value: undefined, canWrite: keepCopy(path, `${path}.broken`) }
    case 'ok':
      if (known(read.value)) return { value: read.value, canWrite: true }
      console.error(`${what} has a shape this version doesn't know; a copy is kept: ${path}`)
      return { value: read.value, canWrite: keepCopy(path, `${path}.unknown`) }
  }
}

function keepCopy(path: string, to: string): boolean {
  try {
    copyFileSync(path, to)
    return true
  } catch (error) {
    console.error(`Could not keep a copy of ${path}; not saving it this session`, error)
    return false
  }
}

// Temp files left by a quit or crash in the middle of a write of `path`.
export function removeStrayTmp(path: string): void {
  const name = basename(path)
  const dir = dirname(path)
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    // no folder yet
    return
  }
  for (const n of names)
    if (n.startsWith(name + '.') && n.endsWith('.tmp')) rmSync(join(dir, n), { force: true })
}

let tmpCount = 0
// Unique per write, so a sync write never shares a temp file with an async one still running.
function tmpPath(path: string): string {
  return `${path}.${process.pid}.${++tmpCount}.tmp`
}

// A number is the indent of JSON.stringify: 0 writes one line, for big files
// like the library index. A function writes the whole text, for a file made to
// be read by a person.
export type JsonFormat<T = unknown> = number | ((data: T) => string)

function toText<T>(data: T, format: JsonFormat<T>): string {
  return typeof format === 'function' ? format(data) : JSON.stringify(data, null, format) + '\n'
}

// Write to a temp file, flush it to disk, then rename over the old file.
// A crash leaves either the old file or the new one, never half of one.
export async function writeJsonFile(path: string, data: unknown, space = 2): Promise<void> {
  await writeFileAtomic(path, toText(data, space))
}

// The same for any file, like the covers.
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  await writeTmp(path, data, async (tmp) => rename(tmp, path))
}

export function writeJsonFileSync<T>(path: string, data: T, format: JsonFormat<T> = 2): void {
  const tmp = tmpPath(path)
  try {
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, toText(data, format))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, path)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
}

// Writes the temp file, then lets the caller decide whether to rename it.
async function writeTmp(
  path: string,
  data: string | Uint8Array,
  commit: (tmp: string) => Promise<void>
): Promise<void> {
  const tmp = tmpPath(path)
  try {
    const fh = await open(tmp, 'w')
    try {
      await fh.writeFile(data)
      await fh.sync()
    } finally {
      await fh.close()
    }
    await commit(tmp)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}

// Saves the latest value a short while after the last change, one write at a time.
// flushSync() is for quitting: it writes the newest value right away, and an
// async write still running skips its rename. That rename is sync on purpose:
// an async rename already handed to the thread pool could not be called back,
// and could land after flushSync's write with the older value.
export class JsonFileWriter<T> {
  #timer: ReturnType<typeof setTimeout> | undefined
  #pending: { data: T } | undefined
  // bumped by every write; an async write that is no longer the latest skips its rename
  #version = 0
  #running: Promise<void> = Promise.resolve()
  // the newest value handed to an async write that has not finished, so flushSync can finish it
  #inFlight: { data: T; version: number } | undefined

  constructor(
    readonly path: string,
    readonly delayMs: number,
    readonly onError: (error: unknown) => void = (e) => console.error(`Could not save ${path}`, e),
    readonly format: JsonFormat<T> = 2
  ) {}

  // The value is written later, so don't change it after handing it over.
  schedule(data: T): void {
    this.#pending = { data }
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => this.#writeNow(), this.delayMs)
  }

  #writeNow(): void {
    this.#timer = undefined
    const pending = this.#pending
    if (!pending) return
    this.#pending = undefined
    const version = ++this.#version
    this.#inFlight = { data: pending.data, version }
    this.#running = this.#running
      .then(() => {
        // a newer value is already queued behind this one
        if (version !== this.#version) return
        return writeTmp(this.path, toText(pending.data, this.format), async (tmp) => {
          if (version === this.#version) renameSync(tmp, this.path)
          else await rm(tmp, { force: true })
        })
      })
      .catch(this.onError)
      .finally(() => {
        if (this.#inFlight?.version === version) this.#inFlight = undefined
      })
  }

  // Resolves once everything scheduled so far is on disk.
  async flush(): Promise<void> {
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#writeNow()
    }
    await this.#running
  }

  // False when the write failed (a full or read-only disk); the error goes to onError.
  flushSync(): boolean {
    clearTimeout(this.#timer)
    this.#timer = undefined
    const pending = this.#pending ?? this.#inFlight
    if (!pending) return true
    this.#pending = undefined
    this.#inFlight = undefined
    ++this.#version
    try {
      writeJsonFileSync(this.path, pending.data, this.format)
      return true
    } catch (error) {
      this.onError(error)
      return false
    }
  }
}
