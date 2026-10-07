import { describe, expect, it } from 'vitest'
import type { Artist } from '../../../../shared/plugins/files/artists'
import type { Track } from '../../../../shared/library'
import { fallbackPalettes, type ThemePalettes } from '../../../../shared/palette'
import {
  allBy,
  artistLinks,
  artistCovers,
  artistPageSongs,
  artistSongs,
  albumArtists,
  filterArtists,
  shownArtists
} from './artists'
import type { Sort } from '../../library/views'

const artist = (name: string, albums: string[] = [], also: string[] = []): Artist => ({
  key: name.toLowerCase(),
  name,
  tags: [],
  albums,
  also
})

const palette = fallbackPalettes('x')
type TestAlbum = { cover: string; palette: ThemePalettes; trackIds: string[] }
const albums: Record<string, TestAlbum> = {
  a: { cover: 'ca', palette, trackIds: ['a1', 'a2'] },
  b: { cover: '', palette, trackIds: ['b1'] },
  c: { cover: 'cc', palette, trackIds: ['c1'] },
  d: { cover: 'cd', palette, trackIds: [] },
  e: { cover: 'ca', palette, trackIds: [] }
}
const album = (id: string): TestAlbum => albums[id]
const songArt = (id: string): { cover: string; palette: ThemePalettes } => ({
  cover: id === 'x1' ? 'cx' : id === 'y1' ? 'ca' : '',
  palette
})
const coversOf = (a: Artist): string[] => artistCovers(a, album, songArt).map((c) => c.cover)

describe('filterArtists', () => {
  it('finds artists by any part of the name, in any case', () => {
    const all = [artist('Simon & Garfunkel'), artist('Paul Simon'), artist('Blur')]
    expect(filterArtists(all, ' simon ').map((a) => a.name)).toEqual([
      'Simon & Garfunkel',
      'Paul Simon'
    ])
    expect(filterArtists(all, '')).toBe(all)
  })

  it('finds them without accents (ticket 039)', () => {
    const all = [artist('Björk'), artist('Sigur Rós')]
    expect(filterArtists(all, 'bjork').map((a) => a.name)).toEqual(['Björk'])
    expect(filterArtists(all, 'RÓS').map((a) => a.name)).toEqual(['Sigur Rós'])
  })
})

describe('shownArtists', () => {
  // DJ Sol has only a song on a compilation, Various Artists owns it
  const all = [
    artist('DJ Sol', [], ['v1']),
    artist('Marina Vale', ['a']),
    artist('Various Artists', ['v']),
    artist('Solo Guest', [], ['a2'])
  ]
  const names = (list: Artist[]): string[] => list.map((a) => a.name)

  it('shows only artists with an album of their own by default', () => {
    expect(names(shownArtists(all, 'album', ''))).toEqual(['Marina Vale', 'Various Artists'])
    expect(albumArtists(all)).toEqual(shownArtists(all, 'album', ' '))
  })

  it('shows every artist for All artists', () => {
    expect(shownArtists(all, 'all', '')).toBe(all)
  })

  it('searches every artist whatever the choice, so a guest can be found', () => {
    expect(names(shownArtists(all, 'album', 'sol'))).toEqual(['DJ Sol', 'Solo Guest'])
    expect(names(shownArtists(all, 'all', 'sol'))).toEqual(['DJ Sol', 'Solo Guest'])
  })
})

describe('artistSongs', () => {
  it('plays their albums in order, then their songs on other albums', () => {
    expect(artistSongs(artist('A', ['a', 'b'], ['x1', 'y1']), album)).toEqual([
      'a1',
      'a2',
      'b1',
      'x1',
      'y1'
    ])
  })
})

describe('artistPageSongs', () => {
  const song = (id: string, title: string): Track =>
    ({ id, title, artist: 'A', album: id, duration: 60 }) as Track
  const songs: Record<string, Track> = { x1: song('x1', 'Zebra'), y1: song('y1', 'Apple') }
  const order = (t: Track): number => ['x1', 'y1'].indexOf(t.id)

  it('plays their albums in order, then the "Also on" songs in the shown sort', () => {
    const a = artist('A', ['a', 'b'], ['x1', 'y1'])
    const play = (sort: Sort | null): string[] =>
      artistPageSongs(a, album, (id) => songs[id], sort, order)
    expect(play(null)).toEqual(['a1', 'a2', 'b1', 'x1', 'y1'])
    expect(play({ k: 't', dir: 1 })).toEqual(['a1', 'a2', 'b1', 'y1', 'x1'])
  })
})

describe('artistCovers', () => {
  it('takes different album covers first, then covers of their other songs, up to 4', () => {
    expect(coversOf(artist('A', ['a', 'b', 'e'], ['x1', 'y1']))).toEqual(['ca', 'cx'])
    expect(coversOf(artist('A', ['a', 'c', 'd'], ['x1', 'y1']))).toEqual(['ca', 'cc', 'cd', 'cx'])
    expect(coversOf(artist('A', ['b']))).toEqual([])
  })
})

describe('artistLinks (ticket 040)', () => {
  const has = (key: string): boolean => key !== 'nobody'

  it('gives one link per name of a split credit, by artist key', () => {
    const split = { artist: 'Sadness, Stellafera', artists: ['Sadness', 'Stellafera'] }
    expect(artistLinks(split, has)).toEqual([
      { name: 'Sadness', key: 'sadness' },
      { name: 'Stellafera', key: 'stellafera' }
    ])
  })

  it('keeps a joint credit with no override whole, as the Artists view does', () => {
    expect(artistLinks({ artist: 'A feat. B' }, has)).toEqual([
      { name: 'A feat. B', key: 'afeat.b' }
    ])
  })

  it('gives no key to a name with no artist page', () => {
    expect(artistLinks({ artist: 'Nobody' }, has)).toEqual([{ name: 'Nobody', key: null }])
  })
})

describe('allBy: the Artist column is left out (ticket 075)', () => {
  it('when every song has the page artist, by name key', () => {
    expect(allBy([{ artist: 'Marina Vale' }, { artist: 'marina  vale' }], 'Marina Vale')).toBe(true)
  })

  it('not with a guest, another artist or a split credit', () => {
    expect(
      allBy([{ artist: 'Marina Vale' }, { artist: 'Marina Vale feat. Kai' }], 'Marina Vale')
    ).toBe(false)
    // a compilation: its rows have their own artists
    expect(allBy([{ artist: 'Kai' }, { artist: 'Juno Park' }], 'Various Artists')).toBe(false)
    expect(
      allBy([{ artist: 'The Ochre Band, Kai', artists: ['The Ochre Band', 'Kai'] }], 'Kai')
    ).toBe(false)
  })
})
