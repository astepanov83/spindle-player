import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JsonFileWriter, readJsonFile, writeJsonFile, writeJsonFileSync } from './json-file'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-json-'))
  file = join(dir, 'settings.json')
})
afterEach(() => {
  vi.useRealTimers()
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

  it('flush writes what is waiting right away', async () => {
    const w = new JsonFileWriter(file, 60_000)
    w.schedule({ n: 1 })
    await w.flush()
    expect(onDisk()).toEqual({ n: 1 })
  })

  it('flushSync wins over an async write still running', async () => {
    const w = new JsonFileWriter(file, 60_000)
    w.schedule({ n: 1 })
    const running = w.flush()
    w.schedule({ n: 2 })
    w.flushSync()
    expect(onDisk()).toEqual({ n: 2 })
    await running
    expect(onDisk()).toEqual({ n: 2 })
    expect(readdirSync(dir)).toEqual(['settings.json'])
  })

  it('flushSync finishes a write that was started but not done', async () => {
    const w = new JsonFileWriter(file, 60_000)
    w.schedule({ n: 1 })
    const running = w.flush()
    w.flushSync()
    expect(onDisk()).toEqual({ n: 1 })
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
    w.flushSync()
    expect(errors).toHaveLength(2)
  })
})
