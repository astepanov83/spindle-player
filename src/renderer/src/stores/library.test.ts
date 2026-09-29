// The library store's mouse Back and Forward between a list and a page.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryData, Track } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'

let library: typeof import('./library.svelte').library

function lib(...ids: string[]): LibraryData {
  const albums = ids.map((id) => ({
    id,
    title: `Album ${id}`,
    artist: 'X',
    year: 0,
    palette: defaultPalettes,
    cover: '',
    coverLarge: '',
    trackIds: []
  }))
  return { albums, tracks: [], folders: [] }
}

// a fresh store each time, so nothing Back closed carries over
beforeEach(async () => {
  vi.resetModules()
  library = (await import('./library.svelte')).library
  library.load(lib('a', 'b'))
})

describe('mouse Back and Forward', () => {
  it('Back closes the open album and Forward opens it again', () => {
    library.open = 'a'
    library.back('open')
    expect(library.open).toBeNull()
    library.forward('open')
    expect(library.open).toBe('a')
  })

  it('Back on the grid does nothing', () => {
    library.back('open')
    expect(library.open).toBeNull()
    library.forward('open')
    expect(library.open).toBeNull()
  })

  it('Forward does nothing while a page is open', () => {
    library.open = 'a'
    library.back('open')
    library.open = 'b'
    library.forward('open')
    expect(library.open).toBe('b')
  })

  it('Forward reopens the album Back closed last', () => {
    library.open = 'a'
    library.back('open')
    library.open = 'b'
    library.back('open')
    library.forward('open')
    expect(library.open).toBe('b')
  })

  it('Forward does not open an album closed on the playlist side', () => {
    library.openPlaylist = 'p'
    library.back('openPlaylist')
    library.forward('open')
    expect(library.open).toBeNull()
    library.forward('openPlaylist')
    expect(library.openPlaylist).toBe('p')
  })

  it('Back goes up a folder and Forward goes back down', () => {
    const track = (id: string, folder: number): LibraryData['tracks'][number] => ({
      id,
      title: id,
      duration: 1,
      albumId: 'a',
      artist: '',
      album: '',
      no: 1,
      disc: 1,
      codec: '',
      folder
    })
    library.load({
      ...lib('a'),
      tracks: [track('x', 2)],
      folders: [
        { name: '/m', parent: -1 },
        { name: 'A', parent: 0 },
        { name: 'B', parent: 1 }
      ]
    })
    const deep = library.folders.nodes[2].key
    library.openFolder(deep)
    library.back('folder')
    expect(library.folder).toBe(library.folders.nodes[1].key)
    // the album side is not touched
    library.forward('open')
    library.forward('folder')
    expect(library.folder).toBe(deep)
  })

  it('Forward skips an album a rescan removed', () => {
    library.open = 'b'
    library.back('open')
    library.load(lib('a'))
    library.forward('open')
    expect(library.open).toBeNull()
  })
})

describe('Artists', () => {
  const photo = { cover: 'spindle://cover/small/p', coverLarge: 'spindle://cover/large/p' }

  it('lists the artists and their photos from the library', () => {
    library.load({ ...lib('a'), artistPhotos: { x: photo } })
    expect(library.artists.map((a) => a.name)).toEqual(['X'])
    expect(library.getArtist('x')?.albums).toEqual(['a'])
    expect(library.photos).toEqual({ x: photo })
    library.load(lib('a'))
    expect(library.photos).toEqual({})
  })

  it('counts libraries, so a photo that failed to show tries again after one', () => {
    const before = library.revision
    library.load(lib('a'))
    expect(library.revision).toBe(before + 1)
  })

  it('Back goes from an album to its artist to the grid, and Forward back down', () => {
    library.openArtist('x')
    library.openArtistAlbum('a')
    library.back('artist')
    expect([library.artist, library.open]).toEqual(['x', null])
    library.back('artist')
    expect([library.artist, library.open]).toEqual([null, null])
    // the Albums side is not touched
    library.forward('open')
    expect(library.open).toBeNull()
    library.forward('artist')
    library.forward('artist')
    expect([library.artist, library.open]).toEqual(['x', 'a'])
  })

  it('closes an artist a rescan removed, and Forward skips it', () => {
    library.openArtist('x')
    library.back('artist')
    const gone = lib('a')
    gone.albums[0].artist = 'Y'
    library.load(gone)
    library.forward('artist')
    expect(library.artist).toBeNull()
    library.openArtist('y')
    library.load(lib('a'))
    expect(library.artist).toBeNull()
  })

  it('follows an artist that was renamed or split to its new key (ticket 024)', () => {
    const named = (artist: string): LibraryData => {
      const d = lib('a')
      d.albums[0].artist = artist
      return d
    }
    library.openArtist('x')
    library.followArtist('кино')
    // a scan's patch that comes before the edit's changes nothing
    library.load(lib('a'))
    expect(library.artist).toBe('x')
    library.load(named('Кино'))
    expect(library.artist).toBe('кино')
    // used once: a later rescan that drops the artist closes it
    library.load(named('Y'))
    expect(library.artist).toBeNull()
  })

  it('does not follow after another artist was opened', () => {
    library.openArtist('x')
    library.followArtist('кино')
    library.openArtist('x')
    const d = lib('a')
    d.albums[0].artist = 'Кино'
    library.load(d)
    expect(library.artist).toBeNull()
  })
})

describe('patches while a scan runs', () => {
  const song = (id: string, albumId: string): Track => ({
    id,
    title: id,
    duration: 1,
    albumId,
    artist: 'X',
    album: albumId,
    no: 1,
    disc: 1,
    codec: '',
    folder: 0
  })

  function start(): void {
    const l = lib('a', 'b')
    l.albums[0].trackIds = ['a1']
    l.albums[1].trackIds = ['b1']
    library.load({ ...l, tracks: [song('a1', 'a'), song('b1', 'b')], epoch: 'e', n: 0 })
  }

  it('adds songs and keeps the album list, the open album and the songs shown', () => {
    start()
    library.open = 'b'
    const albums = library.albums
    const a1 = library.track('a1')
    const gone = library.patch({
      patch: true,
      epoch: 'e',
      from: 0,
      n: 1,
      albums: [{ ...albums[1], trackIds: ['b1', 'b2'] }],
      tracks: [song('b2', 'b')],
      goneTracks: []
    })
    expect(gone).toBe(false)
    expect(library.sent).toEqual({ epoch: 'e', n: 1 })
    expect(library.open).toBe('b')
    expect(library.albums[0]).toBe(albums[0])
    expect(library.track('a1')).toBe(a1)
    expect(library.album('b').trackIds).toEqual(['b1', 'b2'])
    // library order follows the albums
    expect(library.order(library.track('b2'))).toBe(2)
  })

  it('keeps the same album list when only songs changed', () => {
    start()
    const albums = library.albums
    library.patch({
      patch: true,
      epoch: 'e',
      from: 0,
      n: 1,
      albums: [],
      tracks: [{ ...song('a1', 'a'), title: 'Renamed' }],
      goneTracks: []
    })
    expect(library.albums).toBe(albums)
    expect(library.track('a1').title).toBe('Renamed')
  })

  it('reports songs that left, and closes an album that is gone', () => {
    start()
    library.open = 'b'
    const gone = library.patch({
      patch: true,
      epoch: 'e',
      from: 0,
      n: 1,
      albums: [],
      order: ['a'],
      tracks: [],
      goneTracks: ['b1']
    })
    expect(gone).toBe(true)
    expect(library.open).toBeNull()
    expect(library.has('b1')).toBe(false)
  })

  it('updates folders, artists and photos, and keeps the open folder and artist', () => {
    const l = lib('a', 'b')
    l.albums[1].artist = 'Y'
    l.albums[0].trackIds = ['a1']
    l.albums[1].trackIds = ['b1']
    library.load({
      ...l,
      tracks: [song('a1', 'a'), { ...song('b1', 'b'), artist: 'Y', folder: 1 }],
      folders: [
        { name: '/m', parent: -1 },
        { name: 'B', parent: 0 }
      ],
      epoch: 'e',
      n: 0
    })
    library.openFolder(library.folders.nodes[1].key)
    library.openArtist('y')
    const open = library.folder
    const before = library.revision
    // a folder "A" came before "B", with a new song by a new artist
    library.patch({
      patch: true,
      epoch: 'e',
      from: 0,
      n: 1,
      albums: [{ ...library.album('a'), trackIds: ['a1', 'a2'] }],
      tracks: [{ ...song('a2', 'a'), artist: 'Z', folder: 1 }],
      goneTracks: [],
      folders: [
        { name: '/m', parent: -1 },
        { name: 'A', parent: 0 },
        { name: 'B', parent: 0 }
      ],
      folderMoves: [0, 2],
      photos: { z: { cover: 'spindle://cover/small/z', coverLarge: 'spindle://cover/large/z' } }
    })
    expect(library.revision).toBeGreaterThan(before)
    expect(library.track('b1').folder).toBe(2)
    expect(library.folders.nodes.map((n) => n.name)).toEqual(['m', 'A', 'B'])
    expect(library.folder).toBe(open)
    expect(
      library.folders.nodes[library.folders.byKey.get(open!)!].tracks.map((t) => t.id)
    ).toEqual(['b1'])
    expect(library.artist).toBe('y')
    expect(library.getArtist('z')?.also).toEqual(['a2'])
    expect(Object.keys(library.photos)).toEqual(['z'])
  })

  it('takes photos alone without making the lists again', () => {
    start()
    const { albums, artists, folders } = library
    const before = library.revision
    library.patch({
      patch: true,
      epoch: 'e',
      from: 0,
      n: 1,
      albums: [],
      tracks: [],
      goneTracks: [],
      photos: { x: { cover: 'spindle://cover/small/x', coverLarge: 'spindle://cover/large/x' } }
    })
    expect(library.photos.x.cover).toBe('spindle://cover/small/x')
    expect([library.albums, library.artists, library.folders]).toEqual([albums, artists, folders])
    expect(library.artists).toBe(artists)
    // a photo that failed to show tries again
    expect(library.revision).toBe(before + 1)
  })
})
