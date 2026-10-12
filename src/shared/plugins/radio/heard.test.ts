import { describe, expect, it } from 'vitest'
import { defaultPalettes } from '../../palette'
import {
  addHeard,
  findHeard,
  heardHashes,
  heardKey,
  heardSong,
  isKnownHeardFile,
  parseHeard,
  removeHeard,
  withHeardCover,
  type HeardSong
} from './heard'

const metal = { id: 'metal-only', name: 'Metal Only' }
const art = { hash: 'a'.repeat(40), palette: defaultPalettes }
const song = (raw: string, at: number): HeardSong => heardSong(raw, metal, at)!

describe('heardKey', () => {
  it('the same song with another case, accents, a remaster note or a feat', () => {
    const k = heardKey('Iron Maiden - Powerslave')
    expect(heardKey('IRON MAIDEN - powerslave (2015 Remaster)')).toBe(k)
    expect(heardKey('Iron Maiden - Powerslave * Kalle OnAir * Night Shift')).toBe(k)
    expect(heardKey('Björk - Jóga')).toBe(heardKey('Bjork - Joga'))
    expect(heardKey('Daft Punk - Get Lucky (feat. Pharrell)')).toBe(
      heardKey('Daft Punk - Get Lucky')
    )
  })

  it('a live version, another artist and a title with no artist are other songs', () => {
    const k = heardKey('Iron Maiden - Powerslave')
    expect(heardKey('Iron Maiden - Powerslave (Live)')).not.toBe(k)
    expect(heardKey('Dio - Powerslave')).not.toBe(k)
    expect(heardKey('Powerslave')).not.toBe(k)
    expect(heardKey('Station Jingle')).toBe(heardKey('station jingle'))
  })
})

describe('heardSong', () => {
  it('splits the title and keeps the station and the cover', () => {
    expect(heardSong('  Dio - Holy Diver ', metal, 5, art)).toEqual({
      raw: 'Dio - Holy Diver',
      artist: 'Dio',
      song: 'Holy Diver',
      station: 'Metal Only',
      stationId: 'metal-only',
      at: 5,
      art
    })
  })

  it('a title with no artist is the song alone; a blank one is nothing', () => {
    expect(heardSong('Night Shift', metal, 1)).toMatchObject({ artist: '', song: 'Night Shift' })
    expect(heardSong('   ', metal, 1)).toBeUndefined()
  })
})

describe('the list', () => {
  it('in order of when each was heard, a song once', () => {
    let list: HeardSong[] = []
    list = addHeard(list, song('A - One', 30))
    list = addHeard(list, song('B - Two', 10))
    list = addHeard(list, song('C - Three', 20))
    expect(list.map((s) => s.raw)).toEqual(['B - Two', 'C - Three', 'A - One'])
    expect(addHeard(list, song('a - one (Remastered)', 40))).toBe(list)
  })

  it('finds and removes by the song, not the exact text', () => {
    const list = [song('A - One', 1), song('B - Two', 2)]
    expect(findHeard(list, 'A - ONE')?.at).toBe(1)
    expect(removeHeard(list, 'b - two').map((s) => s.raw)).toEqual(['A - One'])
    expect(removeHeard(list, 'C - Three')).toBe(list)
  })

  it('a cover found later goes to a song with none', () => {
    const list = [song('A - One', 1)]
    const next = withHeardCover(list, 'A - One', art)
    expect(next[0].art).toEqual(art)
    const other = { ...art, hash: 'b'.repeat(40) }
    expect(withHeardCover(next, 'A - One', other)).toBe(next)
    expect(withHeardCover(list, 'C - Three', art)).toBe(list)
    expect(heardHashes([...next, { ...song('B - Two', 2), art }])).toEqual([art.hash])
  })
})

describe('the file', () => {
  it('a bad entry is dropped alone, a song twice kept once, in time order', () => {
    const raw = {
      version: 1,
      songs: [
        { raw: 'B - Two', artist: 'B', song: 'Two', station: 'X', stationId: 'rb-1', at: 20 },
        { raw: 'A - One', station: 'X', stationId: 'rb-1', at: 10, art: { hash: 'zz' } },
        { raw: '', stationId: 'rb-1', at: 1 },
        { raw: 'C - Three', stationId: 'bad id!', at: 1 },
        { raw: 'D - Four', stationId: 'rb-1', at: 'yesterday' },
        { raw: 'b - two', stationId: 'rb-1', at: 30 },
        'nonsense'
      ]
    }
    const list = parseHeard(raw)
    expect(list.map((s) => s.raw)).toEqual(['A - One', 'B - Two'])
    expect(list[0]).toEqual({
      raw: 'A - One',
      artist: 'A',
      song: 'One',
      station: 'X',
      stationId: 'rb-1',
      at: 10
    })
  })

  it('knows version 1 only', () => {
    expect(isKnownHeardFile({ version: 1, songs: [] })).toBe(true)
    expect(isKnownHeardFile({ version: 2, songs: [] })).toBe(false)
    expect(isKnownHeardFile({ version: 1 })).toBe(false)
    expect(parseHeard(undefined)).toEqual([])
  })
})
