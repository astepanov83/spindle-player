import { describe, expect, it } from 'vitest'
import { defaultPalettes } from '../../../../shared/palette'
import type { Album } from '../../../../shared/library'
import type { Play } from '../../../../shared/plays'
import { albumSorts, parseAlbumSort, sortAlbums } from './album-sort'

const album = (id: string, title: string, year: number, added: number): Album => ({
  id,
  title,
  artist: 'A',
  year,
  added,
  palette: defaultPalettes,
  cover: '',
  coverLarge: '',
  trackIds: []
})

// in library order (artist, year, title)
const albums = [
  album('a', 'Zebra', 1999, 300),
  album('b', 'apple', 0, 0),
  album('c', 'Mango 10', 2021, 100),
  album('d', 'Mango 9', 2021, 300)
]
const ids = (list: Album[]): string[] => list.map((al) => al.id)

const plays: Record<string, Play> = {
  a: { n: 1, last: 50 },
  c: { n: 5, last: 20 },
  d: { n: 5, last: 30 }
}
const played = (al: Album): Play | undefined => plays[al.id]

describe('sortAlbums', () => {
  it('keeps library order for Artist', () => {
    expect(sortAlbums(albums, 'artist', played)).toBe(albums)
  })

  it('sorts by name, ignoring case and with numbers in order', () => {
    expect(ids(sortAlbums(albums, 'name', played))).toEqual(['b', 'd', 'c', 'a'])
  })

  it('puts the newest year first and no year last; ties keep library order', () => {
    expect(ids(sortAlbums(albums, 'year', played))).toEqual(['c', 'd', 'a', 'b'])
  })

  it('puts the latest added first', () => {
    expect(ids(sortAlbums(albums, 'added', played))).toEqual(['a', 'd', 'c', 'b'])
  })

  it('puts the latest played first, and albums never played last', () => {
    expect(ids(sortAlbums(albums, 'played', played))).toEqual(['a', 'd', 'c', 'b'])
  })

  it('puts the most played first, the latest first on a tie', () => {
    expect(ids(sortAlbums(albums, 'plays', played))).toEqual(['d', 'c', 'a', 'b'])
  })

  it('does not change the list it was given', () => {
    const before = ids(albums)
    sortAlbums(albums, 'name', played)
    expect(ids(albums)).toEqual(before)
  })
})

describe('parseAlbumSort', () => {
  it('takes a known sort and falls back to Artist', () => {
    expect(parseAlbumSort('played')).toBe('played')
    expect(parseAlbumSort('nope')).toBe('artist')
    expect(parseAlbumSort(undefined)).toBe('artist')
  })

  it('offers the six sorts in the ticket order', () => {
    expect(albumSorts.map((s) => s.label)).toEqual([
      'Name',
      'Artist',
      'Year',
      'Recently added',
      'Recently played',
      'Most played'
    ])
  })
})
