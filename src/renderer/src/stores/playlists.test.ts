// The playlists store, with main's save faked.
import { describe, expect, it, vi } from 'vitest'
import type { Album, Track } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'

vi.stubGlobal('window', { playlistsApi: { save: vi.fn() } })
vi.stubGlobal('crypto', {
  randomUUID: (() => {
    let n = 0
    return () => `p${++n}`
  })()
})

const { playlists } = await import('./playlists.svelte')
const { library } = await import('./library.svelte')

describe('removing a playlist', () => {
  it('drops its sort and keeps the others', () => {
    const a = playlists.create()
    const b = playlists.create()
    library.sortPlaylist(a, 't')
    library.sortPlaylist(b, 'd')
    playlists.remove(a)
    expect(library.playlistSorts).toEqual({ [b]: { k: 'd', dir: 1 } })
    expect(library.playlistSort(a)).toBeNull()
  })
})

describe('removing a closed playlist', () => {
  it('does not come back on mouse Forward', () => {
    const a = playlists.create()
    library.openPlaylist = a
    library.back('openPlaylist')
    playlists.remove(a)
    library.forward('openPlaylist')
    expect(library.openPlaylist).toBeNull()
  })
})

describe('removing a playlist while its rows are filtered (ticket 039)', () => {
  it('clears the search text, which was for its rows', () => {
    const a = playlists.create()
    library.section = `pl:${a}`
    library.query = 'blue'
    playlists.remove(a)
    expect(library.section).toBe('songs')
    expect(library.query).toBe('')
  })

  it('keeps the text when another playlist is removed', () => {
    const a = playlists.create()
    const b = playlists.create()
    library.section = `pl:${a}`
    library.query = 'blue'
    playlists.remove(b)
    expect(library.query).toBe('blue')
  })
})

describe('a new playlist from songs (ticket 045)', () => {
  const track = (id: string, albumId: string, album: string, artist: string): Track => ({
    id,
    title: id,
    duration: 60,
    albumId,
    artist,
    album,
    no: 1,
    disc: 1,
    codec: '',
    folder: 0
  })
  const album = (id: string, title: string, trackIds: string[]): Album => ({
    id,
    title,
    artist: '',
    year: 0,
    trackIds,
    cover: '',
    coverLarge: '',
    palette: defaultPalettes
  })

  it('is named after the album, with a number when that name is taken', () => {
    library.load({
      albums: [album('b', 'Blue Hours', ['b1', 'b2']), album('r', 'Red Desert', ['r1'])],
      tracks: [
        track('b1', 'b', 'Blue Hours', 'Marina Vale'),
        track('b2', 'b', 'Blue Hours', 'Marina Vale'),
        track('r1', 'r', 'Red Desert', 'Ochre')
      ],
      folders: []
    })
    const a = playlists.create(['b1', 'b2'])
    const b = playlists.create(['b1'])
    expect(playlists.get(a)?.name).toBe('Blue Hours')
    expect(playlists.get(b)?.name).toBe('Blue Hours 2')
    // songs of two albums: the first song's artist
    expect(playlists.get(playlists.create(['r1', 'b1']))?.name).toBe('Ochre')
  })

  it('is New playlist with no songs, ready to type over', () => {
    expect(playlists.get(playlists.create())?.name).toMatch(/^New playlist/)
  })
})
