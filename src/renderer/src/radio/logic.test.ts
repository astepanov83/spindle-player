import { describe, expect, it } from 'vitest'
import type { Station, Stream } from '../../../shared/stations'
import {
  backNote,
  bitrateLine,
  searchRows,
  stationLine,
  stationMatches,
  cantPlayFormat,
  heardAt,
  msToMidnight,
  firstStream,
  nextStream,
  parseTitle,
  recentRows,
  retryDelayMs,
  stepStation,
  streamChoices
} from './logic'

describe('parseTitle (from webmusicmo)', () => {
  it('splits "artist - song * dj OnAir * show *" into parts', () => {
    expect(
      parseTitle('M-16 (USA) - Shot Down * Blacky OnAir * 60er Bis 95er Beat, Rock * ')
    ).toEqual({
      raw: 'M-16 (USA) - Shot Down * Blacky OnAir * 60er Bis 95er Beat, Rock *',
      track: 'M-16 (USA) - Shot Down',
      artist: 'M-16 (USA)',
      song: 'Shot Down',
      dj: 'Blacky',
      show: '60er Bis 95er Beat, Rock'
    })
  })

  it('handles a plain "artist - song" title', () => {
    const t = parseTitle('Iron Maiden - The Trooper')
    expect([t.artist, t.song, t.dj, t.show]).toEqual(['Iron Maiden', 'The Trooper', '', ''])
  })

  it('keeps a title without a dash as the song', () => {
    const t = parseTitle('Station Jingle')
    expect([t.artist, t.song, t.track]).toEqual(['', 'Station Jingle', 'Station Jingle'])
  })

  it('decodes html entities and handles empty input', () => {
    expect(parseTitle('Foo &amp; Bar - Baz').artist).toBe('Foo & Bar')
    expect(parseTitle('').song).toBe('')
  })
})

const s = (url: string, bitrate?: number): Stream => (bitrate ? { url, bitrate } : { url })

describe('nextStream: nearest bitrate first', () => {
  const streams = [s('a', 64), s('b', 128), s('c', 320), s('d'), s('e', 192), s('f')]

  it('takes the nearest bitrate that has not failed; a tie goes to the lower', () => {
    expect(nextStream(streams, 1, new Set([1]))).toBe(0)
    expect(nextStream(streams, 1, new Set([1, 0]))).toBe(4)
    expect(nextStream(streams, 4, new Set([4, 1]))).toBe(0)
    expect(nextStream(streams, 2, new Set([2]))).toBe(4)
  })

  it('tries streams of unknown bitrate after the known ones, in list order', () => {
    expect(nextStream(streams, 1, new Set([0, 1, 2, 4]))).toBe(3)
    expect(nextStream(streams, 1, new Set([0, 1, 2, 3, 4]))).toBe(5)
  })

  it('from a stream of unknown bitrate, goes in list order', () => {
    expect(nextStream(streams, 3, new Set([3]))).toBe(0)
    expect(nextStream(streams, 5, new Set([5, 0]))).toBe(1)
  })

  it('gives -1 when all have failed', () => {
    expect(nextStream(streams, 0, new Set([0, 1, 2, 3, 4, 5]))).toBe(-1)
  })
})

describe('firstStream', () => {
  it('is the chosen one, else the first', () => {
    const st: Station = { id: 'x', name: 'X', tags: [], streams: [s('a'), s('b')] }
    expect(firstStream(st)).toBe(0)
    expect(firstStream({ ...st, chosen: 'b' })).toBe(1)
    expect(firstStream({ ...st, chosen: 'gone' })).toBe(0)
    expect(firstStream({ ...st, streams: [] })).toBe(-1)
  })
})

describe('retryDelayMs', () => {
  it('waits 1, 2, 4, 8, 16, then 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(retryDelayMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000
    ])
  })
})

describe('stepStation', () => {
  const list = ['a', 'b', 'c'].map((id) => ({ id }))
  it('steps through the list and wraps around', () => {
    expect(stepStation(list, 'a', 1)).toBe('b')
    expect(stepStation(list, 'c', 1)).toBe('a')
    expect(stepStation(list, 'a', -1)).toBe('c')
  })
  it('from a station not in the list: the first, or the last going back', () => {
    expect(stepStation(list, 'zz', 1)).toBe('a')
    expect(stepStation(list, 'zz', -1)).toBe('c')
    expect(stepStation([], 'zz', 1)).toBeUndefined()
  })
})

describe('cantPlayFormat', () => {
  it('is audio passed by main with no sound from it', () => {
    expect(cantPlayFormat(false, { ok: true, bytes: 40000 })).toBe(true)
  })
  it('is not a server main could not reach, a stream that played, or one that sent little', () => {
    expect(cantPlayFormat(false, { ok: false, bytes: 0 })).toBe(false)
    expect(cantPlayFormat(false, undefined)).toBe(false)
    expect(cantPlayFormat(true, { ok: true, bytes: 900000 })).toBe(false)
    expect(cantPlayFormat(false, { ok: true, bytes: 1000 })).toBe(false)
  })
})

describe('streamChoices', () => {
  const s = (url: string, bitrate?: number, codec?: string): Stream => ({ url, bitrate, codec })

  it('lists the highest bitrate first, with its codec', () => {
    const list = streamChoices([s('a', 128, 'mp3'), s('b', 320, 'mp3'), s('c', 64, 'aac')])
    expect(list).toEqual([
      { index: 1, label: '320 kbps mp3', short: '320' },
      { index: 0, label: '128 kbps mp3', short: '128' },
      { index: 2, label: '64 kbps aac', short: '64' }
    ])
  })

  it('puts streams of unknown bitrate last, in list order', () => {
    const list = streamChoices([s('a'), s('b', 128), s('c', undefined, 'mp3')])
    expect(list.map((c) => [c.index, c.label, c.short])).toEqual([
      [1, '128 kbps', '128'],
      [0, 'Bitrate unknown', 'Stream'],
      [2, 'mp3, bitrate unknown', 'mp3']
    ])
  })

  it('numbers streams that would read the same, keeping list order for a tie', () => {
    const list = streamChoices([s('a', 192, 'mp3'), s('b', 320), s('c', 192, 'mp3'), s('d')])
    expect(list.map((c) => c.label)).toEqual([
      '320 kbps',
      '192 kbps mp3',
      '192 kbps mp3 (2)',
      'Bitrate unknown'
    ])
    expect(list.map((c) => c.index)).toEqual([1, 0, 2, 3])
  })

  it('is empty for a station with no streams yet', () => {
    expect(streamChoices([])).toEqual([])
  })
})

describe('recent songs (031)', () => {
  const at = (d: number, h: number, m: number): number => new Date(2026, 8, d, h, m).getTime()
  const now = at(30, 22, 0)

  it('shows the time for today, the day for older titles', () => {
    expect(heardAt(at(30, 21, 4), now)).toBe('21:04')
    expect(heardAt(at(30, 0, 5), now)).toBe('00:05')
    expect(heardAt(at(28, 21, 4), now)).toBe('28 Sep')
  })

  it('lists newest first and marks the title playing now', () => {
    const history = [
      { at: at(30, 21, 8), title: 'Dio - Holy Diver' },
      { at: at(30, 21, 14), title: 'Iron Maiden - Powerslave * Blacky OnAir *' }
    ]
    const rows = recentRows(history, 'Iron Maiden - Powerslave * Blacky OnAir * ', now)
    expect(rows.map((r) => [r.time, r.artist, r.song, r.now])).toEqual([
      ['21:14', 'Iron Maiden', 'Powerslave', true],
      ['21:08', 'Dio', 'Holy Diver', false]
    ])
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
  })

  it('marks nothing when stopped, or when the newest is not what plays', () => {
    const history = [{ at: now, title: 'A - B' }]
    expect(recentRows(history, undefined, now)[0].now).toBe(false)
    expect(recentRows(history, 'C - D', now)[0].now).toBe(false)
  })

  it('marks a title too long for the file, which keeps it cut', () => {
    const long = 'A - ' + 'b'.repeat(600)
    const history = [{ at: now, title: long.slice(0, 500) }]
    expect(recentRows(history, long, now)[0].now).toBe(true)
  })

  it('waits until the next midnight to turn times into days', () => {
    expect(msToMidnight(at(30, 23, 59))).toBe(60_000)
    expect(msToMidnight(at(30, 0, 0))).toBe(86_400_000)
  })

  it('a title with no dash is all song', () => {
    const [r] = recentRows([{ at: now, title: 'Station jingle' }], undefined, now)
    expect([r.artist, r.song]).toEqual(['', 'Station jingle'])
  })

  it('says where the queue came from and how long it is', () => {
    expect(backNote('Late Night', 42)).toBe('From Late Night, 42 songs')
    expect(backNote('Powerslave', 1)).toBe('From Powerslave, 1 song')
    expect(backNote('', 1200)).toBe('1,200 songs')
    expect(backNote('Late Night', 0)).toBe('The queue is empty')
  })
})

describe('Radio view rows (ticket 029)', () => {
  const s: Station = {
    id: 'rb-1',
    name: 'SomaFM Drone Zone',
    tags: ['ambient', 'drone', 'space', 'chillout'],
    country: 'US',
    streams: [
      { url: 'https://x/1', bitrate: 128 },
      { url: 'https://x/2', bitrate: 64 },
      { url: 'https://x/3' },
      { url: 'https://x/4', bitrate: 128 },
      { url: 'https://x/5', bitrate: 320 }
    ]
  }

  it('filters by name, tag or country, any case', () => {
    expect(stationMatches(s, '')).toBe(true)
    expect(stationMatches(s, 'drone z')).toBe(true)
    expect(stationMatches(s, 'SPACE')).toBe(true)
    expect(stationMatches(s, 'us')).toBe(true)
    expect(stationMatches(s, 'metal')).toBe(false)
  })

  it('lists the known bitrates once, lowest first', () => {
    expect(bitrateLine(s)).toBe('64 128 320')
    expect(bitrateLine({ ...s, streams: [{ url: 'https://x/3' }] })).toBe('')
  })

  it('shows three tags and the country', () => {
    expect(stationLine(s)).toBe('ambient, drone, space · us')
    expect(stationLine({ ...s, tags: [] })).toBe('us')
    expect(stationLine({ ...s, country: undefined })).toBe('ambient, drone, space')
  })
})

describe('searchRows', () => {
  it('leaves out stations in My stations: they show above', () => {
    const st = (id: string): Station => ({ id, name: id, tags: [], streams: [] })
    const rows = searchRows([st('rb-1'), st('rb-2'), st('rb-3')], [st('metal-only'), st('rb-2')])
    expect(rows.map((s) => s.id)).toEqual(['rb-1', 'rb-3'])
  })
})
