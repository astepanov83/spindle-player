// loved.json: kept by main when the page says a song was loved or unloved.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/nowhere' } }))

const { LovedStore } = await import('./loved-file')

let dir: string
let path: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-loved-'))
  path = join(dir, 'loved.json')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const read = (): unknown => JSON.parse(readFileSync(path, 'utf8'))

describe('LovedStore', () => {
  it('keeps hearts with their time and reads them back after a restart', () => {
    let now = 1000
    const store = new LovedStore(path, () => now)
    expect(store.get()).toEqual({})
    store.set(['files:a', 'files:b'], true)
    now = 2000
    store.set(['files:c'], true)
    store.set(['files:b'], false)
    store.flushSync()
    expect(read()).toEqual({ version: 1, loved: { 'files:a': 1000, 'files:c': 2000 } })
    expect(new LovedStore(path).get()).toEqual({ 'files:a': 1000, 'files:c': 2000 })
  })

  it('takes no hearts for radio, MFP or a bad message', () => {
    const store = new LovedStore(path)
    store.set(['radio:rb-1', 'mfp:e#1'], true)
    store.set('files:a', true)
    store.set(['files:a'], 'yes')
    store.set([{ key: 'files:a' }], true)
    store.set(null, true)
    store.flushSync()
    expect(store.get()).toEqual({})
    expect(readdirSync(dir)).toEqual([])
  })

  it('writes a little later, not on every click', async () => {
    vi.useFakeTimers()
    try {
      const store = new LovedStore(path)
      store.set(['files:a'], true)
      expect(readdirSync(dir)).toEqual([])
      await vi.advanceTimersByTimeAsync(1100)
      await vi.waitFor(() => expect(readdirSync(dir)).toEqual(['loved.json']))
    } finally {
      vi.useRealTimers()
    }
  })

  it('a moved file keeps its heart, on disk at once', () => {
    writeFileSync(path, JSON.stringify({ version: 1, loved: { 'files:old': 5 } }))
    const store = new LovedStore(path)
    expect(store.moveIds('files', { old: 'new' })).toBe(true)
    expect(read()).toEqual({ version: 1, loved: { 'files:new': 5 } })
    // nothing to move: nothing to write
    expect(store.moveIds('files', { gone: 'x' })).toBe(true)
  })

  it('drops a bad entry alone', () => {
    writeFileSync(path, JSON.stringify({ version: 1, loved: { 'files:a': 'x', 'files:b': 3 } }))
    expect(new LovedStore(path).get()).toEqual({ 'files:b': 3 })
  })

  it('keeps a copy of a file it does not know before saving over it', () => {
    writeFileSync(path, '{"version":9,"loved":{}}')
    const store = new LovedStore(path)
    store.set(['files:a'], true)
    store.flushSync()
    expect(readdirSync(dir).sort()).toEqual(['loved.json', 'loved.json.unknown'])
    expect(readFileSync(`${path}.unknown`, 'utf8')).toBe('{"version":9,"loved":{}}')
  })

  it('never writes a file it could not read', () => {
    mkdirSync(path)
    const store = new LovedStore(path)
    store.set(['files:a'], true)
    store.flushSync()
    // loved for this run, but the folder in its place is left alone
    expect(store.get()['files:a']).toBeTypeOf('number')
    expect(readdirSync(path)).toEqual([])
    expect(store.moveIds('files', { a: 'b' })).toBe(false)
  })
})
