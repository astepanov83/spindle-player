// Small JSON files in userData (settings now, library index and playlists later).
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'fs'
import { open, rename, rm } from 'fs/promises'

export type ReadResult =
  { kind: 'ok'; value: unknown } | { kind: 'missing' } | { kind: 'broken'; error: unknown }

export function readJsonFile(path: string): ReadResult {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' }
    return { kind: 'broken', error }
  }
  try {
    return { kind: 'ok', value: JSON.parse(text) }
  } catch (error) {
    return { kind: 'broken', error }
  }
}

let tmpCount = 0
// Unique per write, so a sync write never shares a temp file with an async one still running.
function tmpPath(path: string): string {
  return `${path}.${process.pid}.${++tmpCount}.tmp`
}

function toText(data: unknown): string {
  return JSON.stringify(data, null, 2) + '\n'
}

// Write to a temp file, flush it to disk, then rename over the old file.
// A crash leaves either the old file or the new one, never half of one.
export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await writeTmp(path, data, async (tmp) => rename(tmp, path))
}

export function writeJsonFileSync(path: string, data: unknown): void {
  const tmp = tmpPath(path)
  try {
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, toText(data))
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
  data: unknown,
  commit: (tmp: string) => Promise<void>
): Promise<void> {
  const tmp = tmpPath(path)
  try {
    const fh = await open(tmp, 'w')
    try {
      await fh.writeFile(toText(data))
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
// flushSync() is for quitting: it writes right away and drops any write still running.
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
    readonly onError: (error: unknown) => void = (e) => console.error(`Could not save ${path}`, e)
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
        return writeTmp(this.path, pending.data, async (tmp) => {
          if (version === this.#version) await rename(tmp, this.path)
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

  flushSync(): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
    const pending = this.#pending ?? this.#inFlight
    if (!pending) return
    this.#pending = undefined
    this.#inFlight = undefined
    ++this.#version
    try {
      writeJsonFileSync(this.path, pending.data)
    } catch (error) {
      this.onError(error)
    }
  }
}
