// The stats page's parts that are no DOM (ticket 116).
import { describe, expect, it } from 'vitest'
import type { PlayedSong, Plays, PlayStats } from '../../../shared/plays'
import type { ItemKey } from '../../../shared/plugins/items'
import type { ItemInfo } from '../plugins/types'
import {
  albumTo,
  artistTo,
  chartScale,
  dayText,
  firstPeriod,
  hoursText,
  monthLabels,
  monthText,
  periodOptions,
  withOlderPlays
} from './stats'

const at = (y: number, m: number, d: number): number => new Date(y, m - 1, d, 12).getTime()

function stats(o: Partial<PlayStats> = {}): PlayStats {
  return {
    period: 'all',
    years: [2026],
    since: at(2026, 10, 1),
    plays: 0,
    seconds: 0,
    songs: 0,
    artists: 0,
    albums: 0,
    topSongs: [],
    topArtists: [],
    topAlbums: [],
    months: [],
    days: [0, 0, 0, 0, 0, 0, 0],
    ...o
  }
}

const song = (o: Partial<PlayedSong> = {}): PlayedSong => ({
  title: 'Song',
  artist: 'Amber Fields',
  album: 'Blue',
  albumArtist: 'Amber Fields',
  length: 200,
  ...o
})

describe('periodOptions', () => {
  it('has This year and All time, and only the years the log has between', () => {
    expect(periodOptions([], 2026)).toEqual([
      { value: 2026, label: 'This year' },
      { value: 'all', label: 'All time' }
    ])
    expect(periodOptions([2026, 2025, 2023], 2026)).toEqual([
      { value: 2026, label: 'This year' },
      { value: 2025, label: 'Last year' },
      { value: 2023, label: '2023' },
      { value: 'all', label: 'All time' }
    ])
    // a log with no play this year still offers it
    expect(periodOptions([2024], 2026).map((o) => o.label)).toEqual([
      'This year',
      '2024',
      'All time'
    ])
  })

  it('starts at this year once the log has a play in it, else all time', () => {
    expect(firstPeriod([2026, 2025], 2026)).toBe(2026)
    expect(firstPeriod([2025], 2026)).toBe('all')
    expect(firstPeriod([], 2026)).toBe('all')
  })
})

describe('words and numbers', () => {
  it('words hours with one decimal under 10', () => {
    expect(hoursText(0)).toBe('0')
    expect(hoursText(1500)).toBe('0.4')
    expect(hoursText(3600 * 9.96)).toBe('10')
    expect(hoursText(3600 * 1284.4)).toBe((1284).toLocaleString())
  })

  it('names days and months', () => {
    expect(dayText(at(2026, 10, 13))).toBe('13 October 2026')
    expect(monthText('2026-02')).toEqual({ full: 'February 2026', short: 'Feb', letter: 'F' })
  })

  it('steps the axis in clean numbers', () => {
    expect(chartScale(0)).toEqual({ top: 1, ticks: [0, 1] })
    expect(chartScale(3)).toEqual({ top: 3, ticks: [0, 1, 2, 3] })
    expect(chartScale(7)).toEqual({ top: 8, ticks: [0, 2, 4, 6, 8] })
    expect(chartScale(42)).toEqual({ top: 60, ticks: [0, 20, 40, 60] })
    expect(chartScale(1234).ticks).toEqual([0, 500, 1000, 1500])
  })

  it('names a year of months each, and many months by their Januaries', () => {
    expect(monthLabels(['2026-01', '2026-02'])).toEqual(['Jan', 'Feb'])
    const many = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(2025, 10 + i)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
    const labels = monthLabels(many)
    expect(labels[0]).toBe('2025')
    expect(labels[2]).toBe('2026')
    expect(labels.filter(Boolean)).toEqual(['2025', '2026'])
  })
})

describe('all time before the log began (plays.json)', () => {
  const names: Record<string, PlayedSong> = {
    'files:a': song({ title: 'A' }),
    'files:b': song({ title: 'B', artist: 'Red Hill', albumArtist: 'Red Hill', album: 'Red' }),
    'files:c': song({
      title: 'C',
      artist: 'Amber Fields, Red Hill',
      artists: ['Amber Fields', 'Red Hill']
    })
  }
  const lookup = (k: ItemKey): PlayedSong | undefined => names[k]

  it('counts the top lists from plays.json while it has more plays than the log', () => {
    const plays: Plays = {
      'files:a': { n: 5, last: at(2026, 9, 1) },
      'files:b': { n: 5, last: at(2026, 9, 3) },
      'files:c': { n: 2, last: at(2026, 9, 2) },
      // left the library: no names to show
      'files:gone': { n: 9, last: at(2026, 9, 4) }
    }
    const log = stats({ plays: 3, seconds: 600, topSongs: [] })
    const r = withOlderPlays(log, plays, lookup, at(2026, 10, 13))
    expect(r.older).toBe(true)
    // a tie goes to the one played last
    expect(r.stats.topSongs.map((t) => [t.title, t.plays])).toEqual([
      ['B', 5],
      ['A', 5],
      ['C', 2]
    ])
    // the split counts for each name
    expect(r.stats.topArtists.map((a) => [a.name, a.plays])).toEqual([
      ['Red Hill', 7],
      ['Amber Fields', 7]
    ])
    expect(r.stats.topAlbums.map((a) => [a.name, a.plays])).toEqual([
      ['Blue', 7],
      ['Red', 5]
    ])
    // the totals stay the log's
    expect(r.stats.plays).toBe(3)
    expect(r.stats.seconds).toBe(600)
  })

  it("keeps the log's lists once it has every play, and for a year", () => {
    const plays: Plays = { 'files:a': { n: 3, last: at(2026, 10, 2) } }
    const log = stats({ plays: 3 })
    expect(withOlderPlays(log, plays, lookup, 0)).toEqual({ stats: log, older: false })
    const year = stats({ period: 2026, plays: 1 })
    expect(withOlderPlays(year, plays, lookup, 0)).toEqual({ stats: year, older: false })
  })

  it('has nothing to add with no plays at all', () => {
    const empty = stats({ years: [], since: undefined })
    expect(withOlderPlays(empty, {}, lookup, 0)).toEqual({ stats: empty, older: false })
  })
})

describe('the pages of top artists and albums', () => {
  const info: ItemInfo = {
    title: 'Song',
    group: 'Blue Hours',
    groupTo: { plugin: 'files', page: 'album/1' },
    names: [
      { name: 'Amber Fields', to: { plugin: 'files', page: 'artist/amber' } },
      { name: 'Red Hill', to: { plugin: 'files', page: 'artist/red' } }
    ]
  }

  it("finds the artist among its song's names, case and spacing aside", () => {
    expect(artistTo(info, 'red  hill')?.page).toBe('artist/red')
    expect(artistTo(info, 'Someone Else')).toBeUndefined()
    expect(artistTo(undefined, 'Red Hill')).toBeUndefined()
  })

  it('opens the album only while the song is on it', () => {
    expect(albumTo(info, 'blue hours')?.page).toBe('album/1')
    expect(albumTo(info, 'Another')).toBeUndefined()
  })
})
