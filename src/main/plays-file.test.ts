// plays.json: counted by main when the page says a song was heard.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/nowhere' } }))

const { PlaysStore } = await import('./plays-file')

let dir: string
let path: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-plays-'))
  path = join(dir, 'plays.json')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const read = (): unknown => JSON.parse(readFileSync(path, 'utf8'))

describe('PlaysStore', () => {
  it('counts plays and reads them back after a restart', () => {
    let now = 1000
    const store = new PlaysStore(path, () => now)
    expect(store.get()).toEqual({})
    store.played('files:a')
    now = 2000
    store.played('files:a')
    store.played('files:b')
    store.flushSync()
    expect(read()).toEqual({
      version: 1,
      plays: { 'files:a': { n: 2, last: 2000 }, 'files:b': { n: 1, last: 2000 } }
    })
    // one line: a big library has an entry for most songs
    expect(readFileSync(path, 'utf8').trim().split('\n')).toHaveLength(1)
    expect(new PlaysStore(path).get()['files:a']).toEqual({ n: 2, last: 2000 })
  })

  it('takes no plays of radio, MFP or a bad message', () => {
    const store = new PlaysStore(path)
    for (const key of ['radio:rb-1', 'mfp:e#1', 'files:', 42, null, { key: 'files:a' }])
      store.played(key)
    store.flushSync()
    expect(store.get()).toEqual({})
    expect(readdirSync(dir)).toEqual([])
  })

  it('writes a little later, not on every play', async () => {
    vi.useFakeTimers()
    try {
      const store = new PlaysStore(path)
      store.played('files:a')
      expect(readdirSync(dir)).toEqual([])
      await vi.advanceTimersByTimeAsync(2100)
      await vi.waitFor(() => expect(readdirSync(dir)).toEqual(['plays.json']))
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves plays to new ids and has them on disk at once', () => {
    writeFileSync(path, JSON.stringify({ version: 1, plays: { 'files:old': { n: 2, last: 5 } } }))
    const store = new PlaysStore(path)
    expect(store.moveIds('files', { old: 'new' })).toBe(true)
    expect(read()).toEqual({ version: 1, plays: { 'files:new': { n: 2, last: 5 } } })
    // nothing to move: nothing to write
    expect(store.moveIds('files', { gone: 'x' })).toBe(true)
  })

  it('keeps a copy of a file it does not know before saving over it', () => {
    writeFileSync(path, '{"version":9,"plays":{}}')
    const store = new PlaysStore(path)
    store.played('files:a')
    store.flushSync()
    expect(readdirSync(dir).sort()).toEqual(['plays.json', 'plays.json.unknown'])
    expect(readFileSync(`${path}.unknown`, 'utf8')).toBe('{"version":9,"plays":{}}')
  })

  it('never writes a file it could not read', () => {
    mkdirSync(path)
    const store = new PlaysStore(path)
    store.played('files:a')
    store.flushSync()
    // counted for this run, but the folder in its place is left alone
    expect(store.get()['files:a']?.n).toBe(1)
    expect(readdirSync(path)).toEqual([])
    expect(store.moveIds('files', { a: 'b' })).toBe(false)
  })
})
