import { describe, expect, it } from 'vitest'
import type { Album } from '../../../../shared/library'
import { defaultPalettes } from '../../../../shared/palette'
import type { Artist } from '../../../../shared/plugins/files/artists'
import { artistParts, theirSongs, topSongs } from './artist-parts'

const album = (id: string, year: number, trackIds: string[], title = id): Album => ({
  id,
  title,
  artist: 'A',
  year,
  added: 0,
  palette: defaultPalettes,
  cover: '',
  coverLarge: '',
  trackIds
})
const ids = (p: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${p}${i}`)

const albums = new Map(
  [
    album('old', 1998, ids('o', 10)),
    album('new', 2009, ids('n', 8)),
    album('noyear', 0, ids('y', 9)),
    album('ep', 2015, ids('e', 9), 'Small Hours EP'),
    album('one', 2004, ['s']),
    album('comp', 2010, ['c1', 'c2', 'c3']),
    album('comp2', 1990, ['d1'])
  ].map((al) => [al.id, al])
)
const get = (id: string): Album => albums.get(id)!
const albumOf = (t: string): string =>
  [...albums.values()].find((al) => al.trackIds.includes(t))!.id
const artist = (own: string[], also: string[]): Artist => ({
  key: 'a',
  name: 'A',
  albums: own,
  also,
  tags: []
})

describe('artistParts (099)', () => {
  it('splits their releases and the albums they are on, each newest first', () => {
    const p = artistParts(
      artist(['old', 'new', 'noyear', 'ep', 'one'], ['c2', 'd1', 'c3']),
      get,
      albumOf
    )
    const of = (list: Album[]): string[] => list.map((al) => al.id)
    expect(of(p.albums)).toEqual(['new', 'old', 'noyear'])
    expect(of(p.singles)).toEqual(['ep', 'one'])
    // one tile per album, however many of their songs are on it
    expect(of(p.appearsOn)).toEqual(['comp', 'comp2'])
  })

  it('leaves a part empty when it has nothing', () => {
    const p = artistParts(artist([], ['c1']), get, albumOf)
    expect([p.albums, p.singles, p.appearsOn.length]).toEqual([[], [], 1])
  })
})

describe('topSongs (099)', () => {
  const plays: Record<string, { n: number; last: number }> = {
    a: { n: 3, last: 1 },
    b: { n: 5, last: 1 },
    c: { n: 3, last: 9 },
    d: { n: 3, last: 1 },
    e: { n: 1, last: 1 },
    f: { n: 2, last: 1 }
  }
  it('gives the most played first, a tie to the one played last, then to the order given', () => {
    expect(topSongs(['x', 'a', 'b', 'c', 'd', 'e', 'f'], (k) => plays[k])).toEqual([
      'b',
      'c',
      'a',
      'd',
      'f'
    ])
  })
  it('gives none when none was played', () => {
    expect(topSongs(['x', 'y'], () => undefined)).toEqual([])
  })
})

describe('theirSongs (099)', () => {
  it('their songs on another album, in album order', () => {
    expect(theirSongs(artist([], ['c3', 'c1']), get('comp'))).toEqual(['c1', 'c3'])
  })
  it('none on their own album, or when all or none of the songs are theirs', () => {
    expect(theirSongs(artist(['comp'], []), get('comp'))).toBeUndefined()
    expect(theirSongs(artist([], ['c1', 'c2', 'c3']), get('comp'))).toBeUndefined()
    expect(theirSongs(artist([], ['d1']), get('comp'))).toBeUndefined()
  })
})
