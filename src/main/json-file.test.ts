import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  JsonFileWriter,
  openJsonFile,
  readJsonFile,
  removeStrayTmp,
  writeJsonFile,
  writeJsonFileSync
} from './json-file'

// Holds an async write inside its fsync, after the temp file is written and
// before the rename, so a test can act while a write is really running.
const writeHold = vi.hoisted(() => ({
  hold: undefined as Promise<void> | undefined,
  entered: undefined as (() => void) | undefined
}))
vi.mock('fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('fs/promises')>()
  const open: typeof fs.open = async (...args) => {
    const fh = await fs.open(...args)
    const sync = fh.sync.bind(fh)
    fh.sync = async () => {
      const hold = writeHold.hold
      if (hold) {
        writeHold.entered?.()
        await hold
      }
      return sync()
    }
    return fh
  }
  return { ...fs, open }
})

// Starts holding writes; `inside` resolves once a write is held, `release` lets it go.
function holdWrites(): { inside: Promise<void>; release: () => void } {
  let release!: () => void
  writeHold.hold = new Promise<void>((r) => (release = r))
  const inside = new Promise<void>((r) => (writeHold.entered = r))
  return {
    inside,
    release: () => {
      writeHold.hold = undefined
      writeHold.entered = undefined
      release()
    }
  }
}

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-json-'))
  file = join(dir, 'settings.json')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const onDisk = (): unknown => JSON.parse(readFileSync(file, 'utf8'))

describe('readJsonFile', () => {
  it('tells a missing file from a broken one', () => {
    expect(readJsonFile(file)).toEqual({ kind: 'missing' })
    writeFileSync(file, '{"theme": "da')
    expect(readJsonFile(file).kind).toBe('broken')
    writeFileSync(file, '{"theme": "dark"}')
    expect(readJsonFile(file)).toEqual({ kind: 'ok', value: { theme: 'dark' } })
  })
})

describe('readJsonFile errors', () => {
  it('calls a file it cannot read unreadable, not broken', () => {
    mkdirSync(file)
    expect(readJsonFile(file).kind).toBe('unreadable')
  })
})

describe('openJsonFile', () => {
  const known = (v: unknown): boolean => (v as { version?: number }).version === 1
  const quiet = (): void => void vi.spyOn(console, 'error').mockImplementation(() => {})

  it('reads a good file and a missing one', () => {
    expect(openJsonFile(file, 'Test', known)).toEqual({ value: undefined, canWrite: true })
    writeFileSync(file, '{"version":1}')
    expect(openJsonFile(file, 'Test', known)).toEqual({ value: { version: 1 }, canWrite: true })
    expect(readdirSync(dir)).toEqual(['settings.json'])
  })

  it('never lets a file it could not read be written', () => {
    quiet()
    mkdirSync(file)
    expect(openJsonFile(file, 'Test', known)).toEqual({ value: undefined, canWrite: false })
  })

  it('keeps a copy of a file that is not JSON', () => {
    quiet()
    writeFileSync(file, '{"vers')
    expect(openJsonFile(file, 'Test', known)).toEqual({ value: undefined, canWrite: true })
    expect(readFileSync(`${file}.broken`, 'utf8')).toBe('{"vers')
  })

  it('keeps a copy of JSON in a shape or version it does not know', () => {
    quiet()
    writeFileSync(file, '{"version":2}')
    expect(openJsonFile(file, 'Test', known)).toEqual({ value: { version: 2 }, canWrite: true })
    expect(readFileSync(`${file}.unknown`, 'utf8')).toBe('{"version":2}')
  })

  it('does not write a file whose copy could not be made', () => {
    quiet()
    writeFileSync(file, '{"version":2}')
    // the copy's name is taken by a folder, so the copy fails
    mkdirSync(`${file}.unknown`)
    expect(openJsonFile(file, 'Test', known).canWrite).toBe(false)
  })
})

describe('removeStrayTmp', () => {
  it('removes temp files of that file only', () => {
    for (const n of [
      'settings.json',
      'settings.json.12.3.tmp',
      'settings.json.broken',
      'queue.json.1.1.tmp',
      'other.tmp'
    ])
      writeFileSync(join(dir, n), '')
    removeStrayTmp(file)
    expect(readdirSync(dir).sort()).toEqual([
      'other.tmp',
      'queue.json.1.1.tmp',
      'settings.json',
      'settings.json.broken'
    ])
    removeStrayTmp(join(dir, 'no', 'such.json'))
  })
})

describe('writeJsonFile', () => {
  it('replaces the file and leaves no temp files', async () => {
    writeFileSync(file, 'old')
    await writeJsonFile(file, { a: 1 })
    expect(onDisk()).toEqual({ a: 1 })
    writeJsonFileSync(file, { a: 2 })
    expect(onDisk()).toEqual({ a: 2 })
    expect(readdirSync(dir)).toEqual(['settings.json'])
  })

  it('keeps the old file when the write fails', async () => {
    writeFileSync(file, '{"a":1}')
    const bad = {
      toJSON: (): never => {
        throw new Error('nope')
      }
    }
    await expect(writeJsonFile(file, bad)).rejects.toThrow('nope')
    expect(() => writeJsonFileSync(file, bad)).toThrow('nope')
    expect(onDisk()).toEqual({ a: 1 })
    expect(readdirSync(dir)).toEqual(['settings.json'])
  })
})

describe('JsonFileWriter', () => {
  it('writes only the last value after a quiet spell', async () => {
    vi.useFakeTimers()
    const w = new JsonFileWriter(file, 500)
    w.schedule({ n: 1 })
    vi.advanceTimersByTime(300)
    w.schedule({ n: 2 })
    vi.advanceTimersByTime(300)
    expect(readJsonFile(file).kind).toBe('missing')
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    await w.flush()
    expect(onDisk()).toEqual({ n: 2 })
  })

  it('writes with a formatter when given one, both async and sync', async () => {
    const w = new JsonFileWriter<{ n: number }>(file, 60_000, undefined, (d) => `n=${d.n}\n`)
    w.schedule({ n: 1 })
    await w.flush()
    expect(readFileSync(file, 'utf8')).toBe('n=1\n')
    w.schedule({ n: 2 })
    w.flushSync()
    expect(readFileSync(file, 'utf8')).toBe('n=2\n')
  })

  it('flushSync says a write worked, or that there was nothing to write', () => {
    const w = new JsonFileWriter(file, 60_000)
    expect(w.flushSync()).toBe(true)
    w.schedule({ n: 1 })
    expect(w.flushSync()).toBe(true)
    expect(onDisk()).toEqual({ n: 1 })
  })

  it('flush writes what is waiting right away', async () => {
    const w = new JsonFileWriter(file, 60_000)
    w.schedule({ n: 1 })
    await w.flush()
    expect(onDisk()).toEqual({ n: 1 })
  })

  it('flushSync wins over an async write still running', async () => {
    const w = new JsonFileWriter(file, 60_000)
    const held = holdWrites()
    w.schedule({ n: 1 })
    const running = w.flush()
    // the async write has its temp file on disk and waits to rename it
    await held.inside
    expect(readdirSync(dir).some((n) => n.endsWith('.tmp'))).toBe(true)
    w.schedule({ n: 2 })
    w.flushSync()
    expect(onDisk()).toEqual({ n: 2 })
    held.release()
    await running
    // the older write did not rename over the newer one, and left no temp file
    expect(onDisk()).toEqual({ n: 2 })
    expect(readdirSync(dir)).toEqual(['settings.json'])
  })

  it('flushSync finishes a write that was started but not done', async () => {
    const w = new JsonFileWriter(file, 60_000)
    const held = holdWrites()
    w.schedule({ n: 1 })
    const running = w.flush()
    await held.inside
    expect(readJsonFile(file).kind).toBe('missing')
    w.flushSync()
    expect(onDisk()).toEqual({ n: 1 })
    held.release()
    await running
    expect(onDisk()).toEqual({ n: 1 })
    expect(readdirSync(dir)).toEqual(['settings.json'])
  })

  it('reports a failed write instead of throwing', async () => {
    const errors: unknown[] = []
    const w = new JsonFileWriter(join(dir, 'no', 'such', 'dir.json'), 0, (e) => errors.push(e))
    w.schedule({ n: 1 })
    await w.flush()
    w.schedule({ n: 2 })
    expect(w.flushSync()).toBe(false)
    expect(errors).toHaveLength(2)
  })
})
