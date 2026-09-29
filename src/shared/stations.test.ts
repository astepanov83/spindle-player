import { describe, expect, it } from 'vitest'
import { defaultPalettes, type ThemePalettes } from './palette'
import {
  addEntry,
  addTitle,
  chooseStream,
  historyFile,
  isKnownHistoryFile,
  isKnownStationsFile,
  mergeStreams,
  moveStation,
  parseHistory,
  parseStation,
  parseStations,
  pruneHistory,
  removeStation,
  saveStation,
  setLogo,
  stationArt,
  stationsFile,
  type RadioHistory,
  type Station
} from './stations'

const hashA = 'a'.repeat(40)
const colors: ThemePalettes = {
  dark: ['#111111', '#222222', '#333333'],
  light: ['#444444', '#555555', '#666666']
}

const st = (id: string, extra: Partial<Station> = {}): Station => ({
  id,
  name: id,
  tags: [],
  streams: [{ url: `https://${id}.example/s` }],
  ...extra
})

describe('parseStation', () => {
  it('keeps a good station as it is', () => {
    const good: Station = {
      id: 'rb-1234',
      name: 'Metal Only',
      site: 'https://www.metal-only.de',
      tags: ['metal', 'de'],
      country: 'DE',
      logoUrl: 'https://x.example/l.png',
      logo: { hash: hashA, palette: colors },
      pls: ['https://x.example/listen.pls'],
      streams: [{ url: 'https://x.example/s', bitrate: 128, codec: 'mp3' }],
      chosen: 'https://x.example/s'
    }
    expect(parseStation(good)).toEqual(good)
  })

  it('drops a station with no usable id, name or stream', () => {
    expect(parseStation(null)).toBeUndefined()
    expect(parseStation({ ...st('a'), id: 'a/b' })).toBeUndefined()
    expect(parseStation({ ...st('a'), name: '  ' })).toBeUndefined()
    expect(parseStation({ ...st('a'), streams: [] })).toBeUndefined()
    expect(parseStation({ ...st('a'), streams: [{ url: 'file:///etc/passwd' }] })).toBeUndefined()
  })

  it('keeps a station with no stream when it has a playlist to read', () => {
    const s = parseStation({ ...st('a'), streams: [], pls: ['https://x.example/a.pls'] })
    expect(s?.streams).toEqual([])
  })

  it('drops bad parts on their own', () => {
    const s = parseStation({
      ...st('a'),
      site: 'javascript:alert(1)',
      tags: ['ok', 3, ' ', ' rock '],
      streams: [
        { url: 'https://a.example/1', bitrate: -5, codec: 7 },
        { url: 'https://a.example/1' },
        { url: 'nope' }
      ],
      pls: ['ftp://x', 'https://x.example/a.pls'],
      chosen: 'https://not-in-list.example/'
    })
    expect(s).toEqual({
      id: 'a',
      name: 'a',
      tags: ['ok', 'rock'],
      streams: [{ url: 'https://a.example/1' }],
      pls: ['https://x.example/a.pls']
    })
  })
})

describe('station logos', () => {
  it('keeps a logo only with a cover hash and a palette', () => {
    const small = { hash: hashA, palette: colors, small: true }
    expect(parseStation(st('a', { logo: small }))?.logo).toEqual(small)
    // where it came from and the palette version are kept
    const full = { ...small, from: 'bundled:metal-only', v: 2 }
    expect(parseStation(st('a', { logo: full }))?.logo).toEqual(full)
    expect(parseStation({ ...st('a'), logo: { ...full, from: 7, v: 'x' } })?.logo).toEqual(small)
    for (const logo of [
      'abc',
      { hash: 'abc', palette: colors },
      { hash: hashA },
      { hash: hashA, palette: { dark: ['red'] } }
    ])
      expect(parseStation({ ...st('a'), logo })?.logo).toBeUndefined()
    // small is true or left out
    expect(parseStation({ ...st('a'), logo: { ...small, small: 'yes' } })?.logo).toEqual({
      hash: hashA,
      palette: colors
    })
  })

  it('gives a station with no logo a tile in the fixed colors', () => {
    expect(stationArt(st('a'))).toEqual({ palette: defaultPalettes, cover: '', coverLarge: '' })
  })

  it('gives a logo the art of an album cover', () => {
    expect(stationArt(st('a', { logo: { hash: hashA, palette: colors } }))).toEqual({
      palette: colors,
      cover: `spindle://cover/small/${hashA}`,
      coverLarge: `spindle://cover/large/${hashA}`
    })
  })

  it('shows a small logo as a tile in its colors on the stage', () => {
    const art = stationArt(st('a', { logo: { hash: hashA, palette: colors, small: true } }))
    expect(art.palette).toBe(colors)
    expect(art.coverLarge).toBe('')
    // rows are small enough for it
    expect(art.cover).toBe(`spindle://cover/small/${hashA}`)
  })

  it('sets or drops the logo of one station, and gives the same list when nothing changes', () => {
    const logo = { hash: hashA, palette: colors }
    const list = [st('a'), st('b')]
    const next = setLogo(list, 'b', logo)
    expect(next[1].logo).toEqual(logo)
    expect(next[0]).toBe(list[0])
    expect(setLogo(next, 'b', { ...logo })).toBe(next)
    expect(setLogo(list, 'zzz', logo)).toBe(list)
    expect(setLogo(next, 'b', undefined)[1]).not.toHaveProperty('logo')
    expect(setLogo(list, 'a', undefined)).toBe(list)
  })
})

describe('parseStations', () => {
  it('gives no stations for no file or a wrong one', () => {
    for (const raw of [undefined, null, 1, [], { stations: 'x' }]) {
      expect(parseStations(raw)).toEqual([])
    }
  })

  it('drops bad stations and repeated ids', () => {
    const raw = { version: 1, stations: [st('a'), st('a', { name: 'again' }), 'junk', st('b')] }
    expect(parseStations(raw).map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('isKnownStationsFile', () => {
  it('knows a file it would write back as it is', () => {
    expect(isKnownStationsFile(stationsFile([st('a')]))).toBe(true)
  })

  it('does not know a newer version or a file that loses a station', () => {
    expect(isKnownStationsFile({ version: 2, stations: [] })).toBe(false)
    expect(isKnownStationsFile({ version: 1, stations: [st('a'), 'junk'] })).toBe(false)
    expect(isKnownStationsFile([])).toBe(false)
  })
})

describe('changing the list', () => {
  it('adds a new station at the end and replaces a known one in place', () => {
    let list = saveStation([st('a'), st('b')], st('c'))
    expect(list.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    list = saveStation(list, st('a', { name: 'New name' }))
    expect(list.map((s) => s.name)).toEqual(['New name', 'b', 'c'])
  })

  it('removes a station', () => {
    expect(removeStation([st('a'), st('b')], 'a').map((s) => s.id)).toEqual(['b'])
  })

  it('moves a station one place, and stops at the ends', () => {
    const list = [st('a'), st('b'), st('c')]
    expect(moveStation(list, 'b', -1).map((s) => s.id)).toEqual(['b', 'a', 'c'])
    expect(moveStation(list, 'b', 1).map((s) => s.id)).toEqual(['a', 'c', 'b'])
    expect(moveStation(list, 'a', -1)).toBe(list)
    expect(moveStation(list, 'c', 1)).toBe(list)
    expect(moveStation(list, 'zzz', 1)).toBe(list)
  })

  it('chooses only a stream the station has', () => {
    const list = [st('a')]
    expect(chooseStream(list, 'a', 'https://a.example/s')[0].chosen).toBe('https://a.example/s')
    expect(chooseStream(list, 'a', 'https://other.example/')).toBe(list)
  })
})

describe('mergeStreams', () => {
  it('adds a new stream and keeps the saved order', () => {
    const saved = [{ url: 'https://a/1', bitrate: 128, codec: 'mp3' }]
    const found = [{ url: 'https://a/2', bitrate: 320, codec: 'mp3' }]
    expect(mergeStreams(saved, found)).toEqual([...saved, ...found])
  })

  it('skips a stream with the same bitrate and codec as one listed', () => {
    const saved = [{ url: 'https://a/1', bitrate: 128, codec: 'mp3' }]
    const found = [{ url: 'https://a/autodj', bitrate: 128, codec: 'mp3' }]
    expect(mergeStreams(saved, found)).toBe(saved)
  })

  it('lists a stream with no bitrate, since it is not known to repeat one', () => {
    const saved = [{ url: 'https://a/1', codec: 'mp3' }]
    const found = [{ url: 'https://a/2', codec: 'mp3' }]
    expect(mergeStreams(saved, found)).toHaveLength(2)
  })

  it('fills in what a saved stream is missing', () => {
    const merged = mergeStreams(
      [{ url: 'https://a/1' }],
      [{ url: 'https://a/1', bitrate: 192, codec: 'mp3' }]
    )
    expect(merged).toEqual([{ url: 'https://a/1', bitrate: 192, codec: 'mp3' }])
  })
})

const hist = (byStation: RadioHistory['byStation']): RadioHistory => ({ version: 1, byStation })

describe('history', () => {
  it('reads a file and drops bad entries', () => {
    const raw = hist({
      a: [{ at: 1, title: 'x' }],
      b: 'junk' as never
    })
    const parsed = parseHistory({
      ...raw,
      byStation: {
        ...raw.byStation,
        c: [
          { at: 'no', title: 1 },
          { at: 2, title: 'ok' }
        ]
      }
    })
    expect(parsed.byStation).toEqual({ a: [{ at: 1, title: 'x' }], c: [{ at: 2, title: 'ok' }] })
    expect(parseHistory(null)).toEqual(hist({}))
  })

  it('knows its own file only', () => {
    expect(isKnownHistoryFile(historyFile(hist({ a: [{ at: 1, title: 'x' }] })))).toBe(true)
    expect(isKnownHistoryFile({ version: 2, byStation: {} })).toBe(false)
    expect(isKnownHistoryFile(null)).toBe(false)
  })

  it('keeps the last 50 titles of a station', () => {
    let h = hist({})
    for (let i = 0; i < 60; i++) h = addTitle(h, 'a', `song ${i}`, i)
    const list = h.byStation.a
    expect(list).toHaveLength(50)
    expect(list[0].title).toBe('song 10')
    expect(list[49].title).toBe('song 59')
  })

  it('ignores a blank title and a repeat of the last one', () => {
    let h = addTitle(hist({}), 'a', 'song', 1)
    expect(addTitle(h, 'a', '  ', 2)).toBe(h)
    expect(addTitle(h, 'a', 'song', 2)).toBe(h)
    h = addTitle(h, 'a', 'other', 3)
    expect(h.byStation.a).toHaveLength(2)
  })

  it('adds to a list by the same rule, so the page and the file agree', () => {
    const list = addEntry([], '  Dio - Holy Diver ', 1)
    expect(list).toEqual([{ at: 1, title: 'Dio - Holy Diver' }])
    // a reconnect sends the title again
    expect(addEntry(list, 'Dio - Holy Diver', 2)).toBe(list)
    expect(addEntry(list, ' ', 2)).toBe(list)
    let long: { at: number; title: string }[] = []
    for (let i = 0; i < 55; i++) long = addEntry(long, `song ${i}`, i)
    expect(long).toHaveLength(50)
    expect(long[0].title).toBe('song 5')
  })

  it('drops a station that is not saved and was not played for 30 days', () => {
    const day = 86_400_000
    const now = 100 * day
    const h = hist({
      old: [{ at: now - 31 * day, title: 'x' }],
      recent: [{ at: now - 29 * day, title: 'x' }],
      savedOld: [{ at: now - 90 * day, title: 'x' }]
    })
    const pruned = pruneHistory(h, (id) => id === 'savedOld', now)
    expect(Object.keys(pruned.byStation).sort()).toEqual(['recent', 'savedOld'])
    expect(pruneHistory(pruned, (id) => id === 'savedOld', now)).toBe(pruned)
  })
})
