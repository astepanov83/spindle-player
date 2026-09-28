import { describe, expect, it } from 'vitest'
import type { Artist } from '../../../shared/artists'
import {
  artistBack,
  artistCovers,
  artistForward,
  artistSongs,
  filterArtists,
  goToArtist,
  type ArtistNav
} from './artists'

const artist = (name: string, albums: string[] = [], also: string[] = []): Artist => ({
  key: name.toLowerCase(),
  name,
  albums,
  also
})

const albums: Record<string, { cover: string; trackIds: string[] }> = {
  a: { cover: 'ca', trackIds: ['a1', 'a2'] },
  b: { cover: '', trackIds: ['b1'] },
  c: { cover: 'cc', trackIds: ['c1'] },
  d: { cover: 'cd', trackIds: [] },
  e: { cover: 'ca', trackIds: [] }
}
const album = (id: string): { cover: string; trackIds: string[] } => albums[id]
const songArt = (id: string): string => (id === 'x1' ? 'cx' : id === 'y1' ? 'ca' : '')

describe('filterArtists', () => {
  it('finds artists by any part of the name, in any case', () => {
    const all = [artist('Simon & Garfunkel'), artist('Paul Simon'), artist('Blur')]
    expect(filterArtists(all, ' simon ').map((a) => a.name)).toEqual([
      'Simon & Garfunkel',
      'Paul Simon'
    ])
    expect(filterArtists(all, '')).toBe(all)
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

describe('artistCovers', () => {
  it('takes different album covers first, then covers of their other songs, up to 4', () => {
    expect(artistCovers(artist('A', ['a', 'b', 'e'], ['x1', 'y1']), album, songArt)).toEqual([
      'ca',
      'cx'
    ])
    expect(artistCovers(artist('A', ['a', 'c', 'd'], ['x1', 'y1']), album, songArt)).toEqual([
      'ca',
      'cc',
      'cd',
      'cx'
    ])
    expect(artistCovers(artist('A', ['b']), album, songArt)).toEqual([])
  })
})

describe('Back and Forward in Artists', () => {
  const top: ArtistNav = { artist: null, album: null, ahead: [] }
  const all = (): boolean => true

  it('Back goes from an album to its artist, then to the grid; Forward comes back down', () => {
    let nav = goToArtist(top, { artist: 'q', album: null })
    nav = goToArtist(nav, { artist: 'q', album: 'a' })
    nav = artistBack(nav)
    expect(nav).toMatchObject({ artist: 'q', album: null })
    nav = artistBack(nav)
    expect(nav).toMatchObject({ artist: null, album: null })
    expect(artistBack(nav)).toEqual(nav)
    nav = artistForward(nav, all)
    expect(nav).toMatchObject({ artist: 'q', album: null })
    nav = artistForward(nav, all)
    expect(nav).toMatchObject({ artist: 'q', album: 'a', ahead: [] })
    expect(artistForward(nav, all)).toEqual(nav)
  })

  it('opening something else forgets what Forward would open', () => {
    let nav = artistBack(goToArtist(top, { artist: 'q', album: null }))
    nav = goToArtist(nav, { artist: 'b', album: null })
    expect(nav.ahead).toEqual([])
    // opening the same one Forward would open keeps the rest
    nav = artistBack(artistBack(goToArtist(nav, { artist: 'b', album: 'x' })))
    nav = goToArtist(nav, { artist: 'b', album: null })
    expect(nav.ahead).toEqual([{ artist: 'b', album: 'x' }])
  })

  it('Forward does nothing when what Back closed is gone or does not fit here', () => {
    const closed = artistBack(goToArtist(top, { artist: 'q', album: null }))
    expect(artistForward(closed, () => false)).toMatchObject({ artist: null, ahead: [] })
    const other = { ...closed, artist: 'b' }
    expect(artistForward(other, all)).toMatchObject({ artist: 'b', ahead: [] })
  })
})
