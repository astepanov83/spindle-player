// The stats page's totals, counted from the play log's lines.
import { describe, expect, it } from 'vitest'
import type { ItemKey } from '../shared/plugins/items'
import { parseLogLine, StatsCounter, type LogLine, type PlayLine } from './play-stats'

// local time, as the page shows it
const at = (y: number, m: number, d: number, h = 12): number => new Date(y, m - 1, d, h).getTime()

function play(k: ItemKey, t: number, o: Partial<PlayLine> = {}): PlayLine {
  return { k, t, d: 200, a: 'Amber Fields', al: 'Blue', aa: 'Amber Fields', ti: k, ...o }
}

function count(period: number | 'all', lines: LogLine[], now = at(2026, 10, 13)): StatsCounter {
  const c = new StatsCounter(period, now)
  for (const l of lines) c.line(l)
  return c
}

describe('parseLogLine', () => {
  it('reads a play and fills what is wrong with empty values', () => {
    expect(parseLogLine({ k: 'files:a', t: 5, d: 'x', a: 3, ti: 'Song' })).toEqual({
      k: 'files:a',
      t: 5,
      d: 0,
      a: '',
      al: '',
      aa: '',
      ti: 'Song'
    })
    expect(parseLogLine({ k: 'files:a', t: 5, d: 1, a: 'A, B', as: ['A', 'B'] })).toMatchObject({
      as: ['A', 'B']
    })
  })

  it('skips a bad line, a play of radio or MFP, and the header', () => {
    for (const raw of [
      null,
      [],
      'x',
      { version: 1 },
      { k: 'files:a' },
      { k: 'files:a', t: -1 },
      { k: 'radio:rb-1', t: 5 },
      { k: 'mfp:e#1', t: 5 },
      { moved: 'nope', ids: {} },
      { moved: 'files', ids: [] }
    ])
      expect(parseLogLine(raw)).toBeUndefined()
  })

  it('reads moved ids, dropping a bad one', () => {
    expect(parseLogLine({ moved: 'files', ids: { a: 'b', c: 3, d: '' } })).toEqual({
      moved: 'files',
      ids: { a: 'b' }
    })
  })
})

describe('StatsCounter', () => {
  it('counts a year and leaves the others out', () => {
    const s = count(2026, [
      play('files:a', at(2025, 12, 31)),
      play('files:a', at(2026, 1, 1), { d: 100 }),
      play('files:b', at(2026, 3, 2), { a: 'Red Hill', aa: 'Red Hill', al: 'Red' }),
      play('files:a', at(2026, 3, 3), { d: 100.4 })
    ]).result()
    expect(s.period).toBe(2026)
    expect(s.since).toBe(at(2025, 12, 31))
    expect(s.years).toEqual([2026, 2025])
    expect(s.plays).toBe(3)
    expect(s.seconds).toBe(400)
    expect(s.songs).toBe(2)
    expect(s.artists).toBe(2)
    expect(s.albums).toBe(2)
    expect(s.months).toHaveLength(12)
    expect(s.months[0]).toEqual({ month: '2026-01', plays: 1 })
    expect(s.months[2]).toEqual({ month: '2026-03', plays: 2 })
    // 1 Jan 2026 is a Thursday, 2 and 3 March a Monday and a Tuesday
    expect(s.days).toEqual([1, 1, 0, 1, 0, 0, 0])
  })

  it('counts all time, with its months from the first play to now', () => {
    const s = count(
      'all',
      [play('files:a', at(2025, 11, 5)), play('files:a', at(2026, 2, 1))],
      at(2026, 3, 9)
    ).result()
    expect(s.plays).toBe(2)
    expect(s.months.map((m) => m.month)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03'
    ])
    expect(s.months.map((m) => m.plays)).toEqual([1, 0, 0, 1, 0])
  })

  it('is empty before the first play', () => {
    for (const period of [2026, 'all'] as const) {
      const s = count(period, []).result()
      expect(s).toMatchObject({
        plays: 0,
        songs: 0,
        years: [],
        topSongs: [],
        days: [0, 0, 0, 0, 0, 0, 0]
      })
      expect(s.since).toBeUndefined()
    }
    expect(count('all', []).result().months).toEqual([])
  })

  it('puts the most played first, a tie going to the one played last', () => {
    const s = count('all', [
      play('files:a', at(2026, 1, 1)),
      play('files:b', at(2026, 1, 2)),
      play('files:c', at(2026, 1, 3)),
      play('files:c', at(2026, 1, 4))
    ]).result()
    expect(s.topSongs.map((t) => [t.key, t.plays])).toEqual([
      ['files:c', 2],
      ['files:b', 1],
      ['files:a', 1]
    ])
    expect(s.topSongs[0]).toEqual({
      key: 'files:c',
      title: 'files:c',
      artist: 'Amber Fields',
      album: 'Blue',
      plays: 2,
      last: at(2026, 1, 4)
    })
  })

  it('keeps ten of each', () => {
    const lines = Array.from({ length: 12 }, (_, i) =>
      play(`files:${i}`, at(2026, 1, 1 + i), {
        a: `Artist ${i}`,
        aa: `Artist ${i}`,
        al: `Album ${i}`
      })
    )
    const s = count('all', lines).result()
    expect(s.songs).toBe(12)
    expect(s.topSongs).toHaveLength(10)
    expect(s.topArtists).toHaveLength(10)
    expect(s.topAlbums).toHaveLength(10)
  })

  it('counts each name of a split credit, and names that differ by case once', () => {
    const s = count('all', [
      play('files:a', at(2026, 1, 1), {
        a: 'Amber Fields, Red Hill',
        as: ['Amber Fields', 'Red Hill']
      }),
      play('files:b', at(2026, 1, 2), { a: 'amber  fields' }),
      play('files:c', at(2026, 1, 3), { a: '' })
    ]).result()
    expect(s.artists).toBe(2)
    expect(s.topArtists.map((a) => [a.name, a.plays, a.key])).toEqual([
      // the spelling of the latest play
      ['amber  fields', 2, 'files:b'],
      ['Red Hill', 1, 'files:a']
    ])
  })

  it('groups albums by title and album artist, or the artist when there is none', () => {
    const s = count('all', [
      play('files:a', at(2026, 1, 1), { al: 'Hits', aa: 'Various Artists', a: 'X' }),
      play('files:b', at(2026, 1, 2), { al: 'Hits', aa: 'Various Artists', a: 'Y' }),
      play('files:c', at(2026, 1, 3), { al: 'Hits', aa: '', a: 'Z' }),
      play('files:d', at(2026, 1, 4), { al: '' })
    ]).result()
    expect(s.albums).toBe(2)
    expect(s.topAlbums.map((a) => [a.name, a.artist, a.plays])).toEqual([
      ['Hits', 'Various Artists', 2],
      ['Hits', 'Z', 1]
    ])
  })

  it('moves the plays above a move line to the new ids, adding up', () => {
    const s = count('all', [
      play('files:old', at(2026, 1, 1), { ti: 'Old name' }),
      play('files:new', at(2026, 1, 2), { ti: 'New name' }),
      play('files:x', at(2026, 1, 3)),
      { moved: 'files', ids: { old: 'new', x: 'y' } },
      play('files:old', at(2026, 1, 4), { ti: 'Another song' })
    ]).result()
    expect(s.songs).toBe(3)
    expect(s.topSongs.map((t) => [t.key, t.title, t.plays])).toEqual([
      ['files:new', 'New name', 2],
      ['files:old', 'Another song', 1],
      ['files:y', 'files:x', 1]
    ])
    // the artist's song played last before the move is found by its new id
    expect(
      count('all', [play('files:x', 1), { moved: 'files', ids: { x: 'y' } }]).result().topArtists[0]
        .key
    ).toBe('files:y')
  })
})
