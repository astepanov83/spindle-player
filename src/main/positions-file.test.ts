// positions.json: kept by main when the page says where a long song is.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { positionsMax } from '../shared/positions'

vi.mock('electron', () => ({ app: { getPath: () => '/nowhere' } }))

const { PositionsStore } = await import('./positions-file')

let dir: string
let path: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-positions-'))
  path = join(dir, 'positions.json')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const read = (): unknown => JSON.parse(readFileSync(path, 'utf8'))

describe('PositionsStore', () => {
  it('keeps places with their time and reads them back after a restart', () => {
    let now = 1000
    const store = new PositionsStore(path, () => now)
    expect(store.get()).toEqual({})
    store.set('files:a', 120)
    now = 2000
    store.set('files:b', 2480.5)
    store.flushSync()
    const at = { 'files:a': { pos: 120, last: 1000 }, 'files:b': { pos: 2480.5, last: 2000 } }
    expect(read()).toEqual({ version: 1, at })
    expect(new PositionsStore(path).get()).toEqual(at)
  })

  it('forgets a place (the song ended, or Start over)', () => {
    const store = new PositionsStore(path, () => 5)
    store.set('files:a', 120)
    store.set('files:b', 130)
    store.set('files:a', null)
    store.flushSync()
    expect(read()).toEqual({ version: 1, at: { 'files:b': { pos: 130, last: 5 } } })
  })

  it('takes no places for radio, MFP or a bad message', () => {
    const store = new PositionsStore(path)
    store.set('radio:rb-1', 50)
    store.set('mfp:e#1', 50)
    store.set('files:a', '50')
    store.set('files:a', -3)
    store.set('files:a', undefined)
    store.set(['files:a'], 50)
    store.flushSync()
    expect(store.get()).toEqual({})
    expect(readdirSync(dir)).toEqual([])
  })

  it('keeps the 500 used last', () => {
    let now = 0
    const store = new PositionsStore(path, () => now)
    for (let i = 0; i <= positionsMax; i++) {
      now = i
      store.set(`files:s${i}`, 100)
    }
    store.flushSync()
    const at = (read() as { at: Record<string, unknown> }).at
    expect(Object.keys(at)).toHaveLength(positionsMax)
    expect(at['files:s0']).toBeUndefined()
    expect(at[`files:s${positionsMax}`]).toEqual({ pos: 100, last: positionsMax })
  })

  it('writes a little later, not every 10 s of a song', async () => {
    vi.useFakeTimers()
    try {
      const store = new PositionsStore(path)
      store.set('files:a', 100)
      store.set('files:a', 110)
      expect(readdirSync(dir)).toEqual([])
      await vi.advanceTimersByTimeAsync(2100)
      await vi.waitFor(() => expect(readdirSync(dir)).toEqual(['positions.json']))
    } finally {
      vi.useRealTimers()
    }
  })

  it('a moved file keeps its place, on disk at once', () => {
    writeFileSync(path, JSON.stringify({ version: 1, at: { 'files:old': { pos: 60, last: 5 } } }))
    const store = new PositionsStore(path)
    expect(store.moveIds('files', { old: 'new' })).toBe(true)
    expect(read()).toEqual({ version: 1, at: { 'files:new': { pos: 60, last: 5 } } })
    // nothing to move: nothing to write
    expect(store.moveIds('files', { gone: 'x' })).toBe(true)
  })

  it('drops a bad entry alone', () => {
    const at = { 'files:a': { pos: 'x', last: 1 }, 'files:b': { pos: 3, last: 1 } }
    writeFileSync(path, JSON.stringify({ version: 1, at }))
    expect(new PositionsStore(path).get()).toEqual({ 'files:b': { pos: 3, last: 1 } })
  })

  it('keeps a copy of a file it does not know before saving over it', () => {
    writeFileSync(path, '{"version":9,"at":{}}')
    const store = new PositionsStore(path)
    store.set('files:a', 100)
    store.flushSync()
    expect(readdirSync(dir).sort()).toEqual(['positions.json', 'positions.json.unknown'])
    expect(readFileSync(`${path}.unknown`, 'utf8')).toBe('{"version":9,"at":{}}')
  })

  it('never writes a file it could not read', () => {
    mkdirSync(path)
    const store = new PositionsStore(path)
    store.set('files:a', 100)
    store.flushSync()
    // kept for this run, but the folder in its place is left alone
    expect(store.get()['files:a']?.pos).toBe(100)
    expect(readdirSync(path)).toEqual([])
    expect(store.moveIds('files', { a: 'b' })).toBe(false)
  })
})
