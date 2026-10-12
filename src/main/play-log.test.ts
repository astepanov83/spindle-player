// plays-log.jsonl: a line per play, only ever added to, read a line at a time.
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayedSong } from '../shared/plays'
import { PlayLog } from './play-log'

let dir: string
let path: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-play-log-'))
  path = join(dir, 'plays-log.jsonl')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

const song: PlayedSong = {
  title: 'Tide',
  artist: 'Amber Fields',
  album: 'Blue',
  albumArtist: 'Amber Fields',
  length: 201.5
}

const lines = (): unknown[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))

const at = (y: number, m: number, d: number): number => new Date(y, m - 1, d, 12).getTime()

describe('PlayLog', () => {
  it('writes a header and a line per play, and adds to it after a restart', () => {
    const log = new PlayLog(path)
    log.add('files:a', song, 1000)
    log.flushSync()
    expect(lines()).toHaveLength(2)
    const again = new PlayLog(path)
    again.add('files:b', { ...song, artists: ['A', 'B'] }, 2000)
    again.flushSync()
    expect(lines()).toEqual([
      { version: 1 },
      {
        k: 'files:a',
        t: 1000,
        d: 201.5,
        a: 'Amber Fields',
        al: 'Blue',
        aa: 'Amber Fields',
        ti: 'Tide'
      },
      {
        k: 'files:b',
        t: 2000,
        d: 201.5,
        a: 'Amber Fields',
        al: 'Blue',
        aa: 'Amber Fields',
        ti: 'Tide',
        as: ['A', 'B']
      }
    ])
  })

  it('writes plays a little later, in one go', async () => {
    vi.useFakeTimers()
    const log = new PlayLog(path, 2000)
    log.add('files:a', song, 1)
    await vi.advanceTimersByTimeAsync(1000)
    log.add('files:b', song, 2)
    expect(readdirSync(dir)).toEqual([])
    await vi.advanceTimersByTimeAsync(1100)
    expect(lines()).toHaveLength(3)
  })

  it('writes what waits when quitting', () => {
    const log = new PlayLog(path, 60000)
    log.add('files:a', song, 1)
    expect(readdirSync(dir)).toEqual([])
    expect(log.flushSync()).toBe(true)
    expect(lines()).toHaveLength(2)
  })

  it('skips a line cut off by a crash, and starts the next one on its own line', async () => {
    const log = new PlayLog(path)
    log.add('files:a', song, at(2026, 1, 1))
    log.flushSync()
    appendFileSync(path, '{"k":"files:b","t":17')
    const after = new PlayLog(path)
    expect((await after.stats('all')).plays).toBe(1)
    after.add('files:c', song, at(2026, 1, 2))
    const s = await after.stats(2026)
    expect(s.plays).toBe(2)
    expect(s.topSongs.map((t) => t.key)).toEqual(['files:c', 'files:a'])
  })

  it('reads back a year, with the plays not written yet', async () => {
    const log = new PlayLog(path, 60000)
    log.add('files:a', song, at(2025, 6, 1))
    log.add('files:a', song, at(2026, 2, 1))
    log.add('files:b', { ...song, title: 'Rain' }, at(2026, 2, 3))
    const s = await log.stats(2026, at(2026, 10, 13))
    expect(s).toMatchObject({ period: 2026, plays: 2, songs: 2, years: [2026, 2025], seconds: 403 })
    expect(s.since).toBe(at(2025, 6, 1))
    expect(s.months[1]).toEqual({ month: '2026-02', plays: 2 })
    expect(s.topSongs[0]).toMatchObject({ key: 'files:b', title: 'Rain' })
  })

  it('is empty with no file', async () => {
    const s = await new PlayLog(path).stats('all')
    expect(s.plays).toBe(0)
    expect(s.since).toBeUndefined()
    expect(readdirSync(dir)).toEqual([])
  })

  it('keeps moved ids as a line of their own, written at once', async () => {
    const log = new PlayLog(path, 60000)
    log.add('files:old', song, 1)
    expect(log.moveIds('files', { old: 'new' })).toBe(true)
    expect(lines()).toEqual([
      { version: 1 },
      expect.objectContaining({ k: 'files:old' }),
      { moved: 'files', ids: { old: 'new' } }
    ])
    expect((await log.stats('all')).topSongs[0].key).toBe('files:new')
    // nothing moved: no line
    expect(log.moveIds('files', {})).toBe(true)
    expect(lines()).toHaveLength(3)
  })

  it('keeps a copy of a broken file and starts again', async () => {
    writeFileSync(path, 'not a log\n')
    const log = new PlayLog(path)
    expect((await log.stats('all')).plays).toBe(0)
    log.add('files:a', song, 1)
    log.flushSync()
    expect(readFileSync(`${path}.broken`, 'utf8')).toBe('not a log\n')
    expect(lines()).toHaveLength(2)
  })

  it('leaves a file of a newer version alone', async () => {
    const text = '{"version":2}\n{"k":"files:a","t":1}\n'
    writeFileSync(path, text)
    const log = new PlayLog(path)
    log.add('files:b', song, 2)
    log.flushSync()
    expect(readFileSync(path, 'utf8')).toBe(text)
    expect(readdirSync(dir)).toEqual(['plays-log.jsonl'])
    expect((await log.stats('all')).plays).toBe(0)
  })

  it('never writes a file it could not read', async () => {
    mkdirSync(path)
    const log = new PlayLog(path)
    log.add('files:a', song, 1)
    expect(log.flushSync()).toBe(true)
    expect(readdirSync(path)).toEqual([])
    expect((await log.stats('all')).plays).toBe(0)
  })

  it('says when a write failed', () => {
    const errors: unknown[] = []
    const log = new PlayLog(path, 60000, (e) => errors.push(e))
    log.add('files:a', song, 1)
    log.flushSync()
    rmSync(path)
    mkdirSync(path)
    log.add('files:b', song, 2)
    expect(log.flushSync()).toBe(false)
    expect(errors).toHaveLength(1)
  })
})
