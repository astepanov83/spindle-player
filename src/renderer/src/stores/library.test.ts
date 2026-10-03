// The library store: where it is, its history (ticket 051), and the library it holds.
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

// a fresh store each time, so no history carries over
beforeEach(async () => {
  vi.resetModules()
  library = (await import('./library.svelte')).library
  library.load(lib('a', 'b'))
})

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

describe('Back and Forward (ticket 051)', () => {
  it('Back closes the open album and Forward opens it again', () => {
    library.openAlbum('a')
    library.back()
    expect(library.open).toBeNull()
    library.forward()
    expect(library.open).toBe('a')
  })

  it('does nothing with no history, and says so for the buttons', () => {
    expect([library.canBack, library.canForward]).toEqual([false, false])
    library.back()
    library.forward()
    expect([library.chip, library.open]).toEqual(['albums', null])
  })

  it('a new step drops what was ahead', () => {
    library.openAlbum('a')
    library.back()
    library.openAlbum('b')
    expect(library.canForward).toBe(false)
    library.back()
    library.forward()
    expect(library.open).toBe('b')
  })

  it('goes back across chips: from a folder to the album it was opened from', () => {
    library.load({
      ...lib('a'),
      tracks: [track('x', 1)],
      folders: [
        { name: '/m', parent: -1 },
        { name: 'A', parent: 0 }
      ]
    })
    const folder = library.folders.nodes[1].key
    library.openAlbum('a')
    library.showFolder(folder)
    expect([library.chip, library.section, library.folder]).toEqual(['folders', 'folders', folder])
    library.back()
    expect([library.chip, library.section, library.open]).toEqual(['albums', 'songs', 'a'])
    library.forward()
    expect([library.chip, library.folder]).toEqual(['folders', folder])
  })

  it('each chip keeps its page while another one shows', () => {
    library.openAlbum('a')
    library.pickChip('folders')
    library.openFolder('k')
    library.pickChip('albums')
    expect(library.open).toBe('a')
    library.pickChip('folders')
    expect(library.folder).toBe('k')
  })

  it('the chip shown goes to its top, as a step', () => {
    library.openAlbum('a')
    library.pickChip('albums')
    expect(library.open).toBeNull()
    library.back()
    expect(library.open).toBe('a')
    library.pickChip('artists')
    library.openArtist('x')
    library.openArtistAlbum('a')
    library.pickChip('artists')
    expect([library.artist, library.artistAlbum]).toEqual([null, null])
    library.pickSection('folders')
    library.openFolder('k')
    library.pickSection('folders')
    expect(library.folder).toBeNull()
  })

  it('Back goes up a folder, one step at a time', () => {
    library.openFolder('a')
    library.openFolder('b')
    library.back()
    expect(library.folder).toBe('a')
  })

  it('a step is not taken for the place already shown', () => {
    library.openAlbum('a')
    library.openAlbum('a')
    library.back()
    expect(library.open).toBeNull()
    expect(library.canBack).toBe(false)
  })

  it('skips an album a rescan removed', () => {
    library.pickChip('radio')
    library.pickChip('albums')
    library.openAlbum('b')
    library.pickChip('radio')
    library.load(lib('a'))
    library.back()
    // "b" is gone, so that step is the Albums grid
    expect([library.chip, library.open]).toEqual(['albums', null])
    library.back()
    // the grid again would change nothing, so it goes on to Radio
    expect(library.chip).toBe('radio')
  })

  it('brings back the search text a step had', () => {
    library.query = 'blue'
    library.showAll('albums')
    library.openAlbum('a')
    expect([library.query, library.searchAll]).toEqual(['', null])
    library.back()
    expect([library.query, library.searchAll, library.open]).toEqual(['blue', 'albums', null])
    // typing is not a step
    library.query = 'blue h'
    library.back()
    expect([library.query, library.searchAll]).toEqual(['blue', null])
  })

  it('says once that a place seen before is shown, for the scroll place', () => {
    library.openAlbum('a')
    expect(library.takeReturn()).toBe(false)
    library.back()
    expect(library.takeReturn()).toBe(true)
    expect(library.takeReturn()).toBe(false)
    library.pickChip('folders')
    expect(library.takeReturn()).toBe(true)
    library.pickChip('albums')
    library.openAlbum('b')
    expect(library.takeReturn()).toBe(false)
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
    library.back()
    expect([library.artist, library.artistAlbum]).toEqual(['x', null])
    library.back()
    expect([library.artist, library.artistAlbum]).toEqual([null, null])
    // an album opened from an artist is not the Albums chip's
    expect(library.open).toBeNull()
    library.forward()
    library.forward()
    expect([library.artist, library.artistAlbum]).toEqual(['x', 'a'])
  })

  it('closes an artist a rescan removed, and Forward skips it', () => {
    library.openArtist('x')
    library.back()
    const gone = lib('a')
    gone.albums[0].artist = 'Y'
    library.load(gone)
    library.forward()
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
    library.openAlbum('b')
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
    library.openAlbum('b')
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

describe('search text (ticket 039)', () => {
  it('is cleared when a chip is picked', () => {
    library.openAlbum('a')
    library.query = 'metal'
    library.pickChip('artists')
    expect(library.query).toBe('')
    library.query = 'metal'
    library.pickChip('albums')
    expect(library.query).toBe('')
    // another chip keeps its page (ticket 051)
    expect(library.open).toBe('a')
  })

  it('is cleared when another section is picked', () => {
    library.pickSection('radio')
    library.query = 'jazz'
    library.pickSection('songs')
    expect(library.section).toBe('songs')
    expect(library.query).toBe('')
  })

  it('does not close the open album while typing', () => {
    library.openAlbum('a')
    library.query = 'harbor'
    expect(library.open).toBe('a')
    library.query = ''
    expect(library.open).toBe('a')
  })

  it('"Show all" goes back to the results when the text is cleared', () => {
    library.query = 'harbor'
    library.showAll('songs')
    library.query = 'harbor l'
    expect(library.searchAll).toBe('songs')
    library.query = ' '
    expect(library.searchAll).toBeNull()
    library.query = 'harbor'
    library.showAll('albums')
    library.pickChip('artists')
    expect(library.searchAll).toBeNull()
  })
})

describe('links from what plays (ticket 040)', () => {
  it('opens an album in Albums, from any chip or section, with no search', () => {
    library.go({ chip: 'radio', section: 'pl:p1' })
    library.openArtist('x')
    library.query = 'blue'
    library.showAlbum('a', 'a/1')
    expect([library.chip, library.section, library.open]).toEqual(['albums', 'albums', 'a'])
    // the Artists chip keeps its page (ticket 051)
    expect(library.artist).toBe('x')
    expect(library.query).toBe('')
    expect(library.landing).toEqual({ song: 'a/1' })
  })

  it('does nothing for an album a rescan removed', () => {
    library.go({ chip: 'radio' })
    library.showAlbum('gone')
    expect([library.chip, library.open]).toEqual(['radio', null])
  })

  it('opens an artist in Artists, as a new step for Forward', () => {
    library.openArtist('x')
    library.openArtistAlbum('a')
    library.back()
    library.pickChip('albums')
    library.openAlbum('b')
    library.showArtist('x')
    expect([library.chip, library.section, library.artist, library.artistAlbum]).toEqual([
      'artists',
      'artists',
      'x',
      null
    ])
    // a new step: Forward has nothing to reopen
    expect(library.canForward).toBe(false)
    library.back()
    expect([library.chip, library.open]).toEqual(['albums', 'b'])
    library.landing = null
    library.showArtist('nobody')
    expect(library.artist).toBe('x')
    // nothing opened, so nothing to scroll
    expect(library.landing).toBeNull()
  })

  it('opens a playlist in both templates, and Radio', () => {
    library.showPlaylist('p1')
    expect([library.chip, library.openPlaylist, library.section]).toEqual([
      'playlists',
      'p1',
      'pl:p1'
    ])
    library.showRadio()
    // the Playlists chip keeps its page (ticket 051)
    expect([library.chip, library.section, library.openPlaylist]).toEqual(['radio', 'radio', 'p1'])
  })

  it('opens what "From" names', () => {
    library.showFrom({ kind: 'album', id: 'b' })
    expect([library.chip, library.open, library.landing]).toEqual(['albums', 'b', { song: null }])
    library.showFrom({ kind: 'artist', id: 'x' })
    expect([library.chip, library.artist]).toEqual(['artists', 'x'])
    library.showFrom({ kind: 'playlist', id: 'p1' })
    expect(library.openPlaylist).toBe('p1')
    library.showFrom({ kind: 'folder', id: 'k' })
    expect([library.chip, library.section, library.folder]).toEqual(['folders', 'folders', 'k'])
    // every link starts its page at the top, also one already open
    expect(library.landing).toEqual({ song: null })
  })

  it('says whether "From" still has something to open', () => {
    expect(library.canShow({ kind: 'album', id: 'a' })).toBe(true)
    expect(library.canShow({ kind: 'album', id: 'gone' })).toBe(false)
    expect(library.canShow({ kind: 'artist', id: 'x' })).toBe(true)
    expect(library.canShow({ kind: 'artist', id: 'y' })).toBe(false)
    expect(library.canShow({ kind: 'folder', id: 'nowhere' })).toBe(false)
  })
})

describe('Music For Programming (ticket 052)', () => {
  // local album 'a' with song a1, and episode 'e' with songs e1 and e2
  function withMfp(): LibraryData {
    const base = lib('a')
    const album = (
      id: string,
      trackIds: string[],
      online?: 'mfp'
    ): LibraryData['albums'][number] => ({
      ...base.albums[0],
      id,
      title: `Album ${id}`,
      artist: online ? 'Mixer' : 'X',
      trackIds,
      ...(online ? { online } : {})
    })
    const song = (id: string, albumId: string, online?: 'mfp'): Track => ({
      ...track(id, online ? -1 : 0),
      albumId,
      artist: online ? 'Guest' : 'X',
      ...(online ? { online } : {})
    })
    return {
      albums: [album('a', ['a1']), album('e', ['e1', 'e2'], 'mfp')],
      tracks: [song('a1', 'a'), song('e1', 'e', 'mfp'), song('e2', 'e', 'mfp')],
      folders: [{ name: '/m', parent: -1 }]
    }
  }

  beforeEach(() => library.load(withMfp()))

  it('keeps episodes out of the albums list and the artists, but finds them by id', () => {
    expect(library.albums.map((a) => a.id)).toEqual(['a'])
    expect(library.mfpAlbums.map((a) => a.id)).toEqual(['e'])
    expect(library.artists.map((a) => a.name)).toEqual(['X'])
    expect(library.album('e').title).toBe('Album e')
    expect(library.track('e2').albumId).toBe('e')
  })

  it('opens an episode in the MFP chip, and Back goes to the list', () => {
    library.pickChip('mfp')
    library.openEpisode('e')
    expect([library.chip, library.episode]).toEqual(['mfp', 'e'])
    library.back()
    expect(library.episode).toBeNull()
  })

  it('a link to an episode album opens it in the MFP chip and section', () => {
    library.showAlbum('e', 'e2')
    expect([library.chip, library.section, library.episode]).toEqual(['mfp', 'mfp', 'e'])
    expect(library.open).toBeNull()
    expect(library.landing).toEqual({ song: 'e2' })
  })

  it('a link to a local album still opens Albums', () => {
    library.showAlbum('a')
    expect([library.chip, library.open]).toEqual(['albums', 'a'])
  })

  it('the MFP chip picked again goes back to the list', () => {
    library.pickChip('mfp')
    library.openEpisode('e')
    library.pickChip('mfp')
    expect(library.episode).toBeNull()
  })

  it('closes an episode that is gone (the setting turned off)', () => {
    library.pickChip('mfp')
    library.openEpisode('e')
    library.load(lib('a'))
    expect(library.episode).toBeNull()
    expect(library.mfpAlbums).toEqual([])
  })

  it('keeps the same albums list when only episodes change', () => {
    const before = library.albums
    const next = withMfp()
    next.albums[1] = { ...next.albums[1], title: 'Renamed' }
    library.patch({
      patch: true,
      epoch: 'x',
      from: 0,
      n: 1,
      albums: [next.albums[1]],
      tracks: [],
      goneTracks: []
    })
    expect(library.albums).toBe(before)
    expect(library.mfpAlbums[0].title).toBe('Renamed')
  })
})
