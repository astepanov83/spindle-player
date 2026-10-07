// The playlists store, with main's save faked.
import { describe, expect, it, vi } from 'vitest'
import type { Album, Track } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'

// radio's page half hears main from the start
vi.stubGlobal('window', {
  playlistsApi: { save: vi.fn() },
  radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
})
vi.stubGlobal('crypto', {
  randomUUID: (() => {
    let n = 0
    return () => `p${++n}`
  })()
})

const { playlists } = await import('./playlists.svelte')
const { library, playlistPage } = await import('./library.svelte')
const { files } = await import('../plugins/files/store.svelte')
const { navTabs } = await import('../plugins')
const { notice } = await import('./notice.svelte')

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

describe('removing a playlist in history (ticket 051)', () => {
  it('does not come back on Back or Forward', () => {
    const a = playlists.create()
    library.openPlaylistPage(null)
    library.openPlaylistPage(a)
    library.back()
    playlists.remove(a)
    library.forward()
    expect(library.openPlaylist).toBeNull()
    expect(library.canForward).toBe(false)
  })

  it('leaves the playlist shown, in both templates', () => {
    library.setTabs(navTabs())
    library.showIn('chips')
    const a = playlists.create()
    library.showPlaylist(a)
    playlists.remove(a)
    // Studio's chip shows the list
    expect([library.tab, library.openPlaylist]).toEqual(['playlists', null])
    library.showIn('sidebar')
    const b = playlists.create()
    library.showPlaylist(b)
    playlists.remove(b)
    // Classic has none: its first section
    expect([library.tab, library.openPlaylist]).toEqual(['songs', null])
  })
})

describe('removing a playlist while its rows are filtered (ticket 039)', () => {
  it('clears the search text, which was for its rows', () => {
    const a = playlists.create()
    library.pickTab('playlists', playlistPage(a))
    library.query = 'blue'
    playlists.remove(a)
    expect(library.tab).toBe('songs')
    expect(library.query).toBe('')
  })

  it('keeps the text when another playlist is removed', () => {
    const a = playlists.create()
    const b = playlists.create()
    library.pickTab('playlists', playlistPage(a))
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
    added: 0,
    trackIds,
    cover: '',
    coverLarge: '',
    palette: defaultPalettes
  })

  it('is named after the album, with a number when that name is taken', () => {
    files.load({
      albums: [album('b', 'Blue Hours', ['b1', 'b2']), album('r', 'Red Desert', ['r1'])],
      tracks: [
        track('b1', 'b', 'Blue Hours', 'Marina Vale'),
        track('b2', 'b', 'Blue Hours', 'Marina Vale'),
        track('r1', 'r', 'Red Desert', 'Ochre')
      ],
      folders: []
    })
    const a = playlists.create(['files:b1', 'files:b2'])
    const b = playlists.create(['files:b1'])
    expect(playlists.get(a)?.name).toBe('Blue Hours')
    expect(playlists.get(b)?.name).toBe('Blue Hours 2')
    // songs of two albums: the first song's artist
    expect(playlists.get(playlists.create(['files:r1', 'files:b1']))?.name).toBe('Ochre')
  })

  it('is New playlist with no songs, ready to type over', () => {
    expect(playlists.get(playlists.create())?.name).toMatch(/^New playlist/)
  })
})

describe('item keys (ticket 055)', () => {
  const song = (id: string): Track => ({
    id,
    title: id,
    duration: 60,
    albumId: 'x',
    artist: 'A',
    album: 'X',
    no: 1,
    disc: 1,
    codec: '',
    folder: 0
  })

  it('keeps songs of any plugin as keys, and removes them by key', () => {
    files.load({ albums: [], tracks: [song('f1')], folders: [] })
    const id = playlists.create(['files:f1', 'mfp:m1'])
    expect(playlists.get(id)?.items).toEqual(['files:f1', 'mfp:m1'])
    playlists.add(id, ['mfp:m1', 'files:gone'])
    expect(playlists.get(id)?.items).toEqual(['files:f1', 'mfp:m1', 'files:gone'])
    playlists.removeItems(id, ['mfp:m1', 'files:gone'])
    expect(playlists.get(id)?.items).toEqual(['files:f1'])
  })

  it("renames only the files plugin's keys when ids move", () => {
    const id = playlists.create()
    playlists.load([{ id, name: 'Mix', items: ['files:a', 'mfp:a'] }])
    playlists.moveIds('files', { a: 'b' })
    expect(playlists.get(id)?.items).toEqual(['files:b', 'mfp:a'])
  })
})

describe('undo of Remove from this playlist (ticket 071)', () => {
  const song = (id: string): Track => ({
    id,
    title: `Song ${id}`,
    duration: 60,
    albumId: 'x',
    artist: 'A',
    album: 'X',
    no: 1,
    disc: 1,
    codec: '',
    folder: 0
  })

  it('says which song left which playlist, and Undo puts it back at its place', () => {
    files.load({ albums: [], tracks: ['s1', 's2', 's3'].map(song), folders: [] })
    const id = playlists.create()
    playlists.load([{ id, name: 'Mix', items: ['files:s1', 'files:s2', 'files:s3'] }])
    playlists.removeItems(id, ['files:s2'])
    expect(playlists.get(id)?.items).toEqual(['files:s1', 'files:s3'])
    expect(notice.text).toBe('Removed from Mix: "Song s2"')
    expect(notice.action?.label).toBe('Undo')
    notice.press()
    expect(playlists.get(id)?.items).toEqual(['files:s1', 'files:s2', 'files:s3'])
  })

  it('counts several songs, and brings them all back', () => {
    const id = playlists.create()
    playlists.load([{ id, name: 'Mix', items: ['files:s1', 'files:s2', 'files:s3'] }])
    playlists.removeItems(id, ['files:s3', 'files:s1'])
    expect(notice.text).toBe('Removed 2 songs from Mix')
    notice.press()
    expect(playlists.get(id)?.items).toEqual(['files:s1', 'files:s2', 'files:s3'])
  })

  it('says nothing when the song was not in it', () => {
    notice.hide()
    const id = playlists.create()
    playlists.load([{ id, name: 'Mix', items: ['files:s1'] }])
    playlists.removeItems(id, ['files:s9'])
    expect(notice.text).toBe('')
  })

  it('puts back a song whose id changed meanwhile by its new id', () => {
    const id = playlists.create()
    playlists.load([{ id, name: 'Mix', items: ['files:s1', 'files:s2'] }])
    playlists.removeItems(id, ['files:s1'])
    playlists.moveIds('files', { s1: 'n1', s2: 'n2' })
    notice.press()
    expect(playlists.get(id)?.items).toEqual(['files:n1', 'files:n2'])
  })
})
