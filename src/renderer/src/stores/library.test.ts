// The library store: where it is, its history (ticket 051), its tabs from
// the plugins that are on (ticket 059), and the library it holds.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queueLink } from '../../../shared/saved-queue'
import type { LibraryData, Track } from '../../../shared/library'
import type { MfpEpisodes } from '../../../shared/mfp'
import { defaultPalettes } from '../../../shared/palette'
import { albumPage, artistPage, folderPage, parsePage } from '../plugins/files/pages'

// radio's page half hears main from the start
vi.stubGlobal('window', {
  radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
})

let library: typeof import('./library.svelte').library
let settings: typeof import('./settings.svelte').settings
let p: typeof import('../plugins')
type FilesNav = typeof import('../plugins/files/nav')
let files: FilesNav & {
  shownAlbum(): string | null
  openAlbum(id: string | null): void
  shownArtist(): { key: string | null; album: string | null }
  openArtistAlbum(id: string | null): void
  shownFolderKey(): string | null
  openFolder(key: string | null): void
  showFolder(key: string): void
}
// the MFP tab's open episode, and its data as main sends it
let mfp: { openEpisode(id: string | null): void; shownEpisode(): string | null }
let mfpStore: typeof import('../plugins/mfp/store.svelte').mfp

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

// The files tabs' pages, read and opened as the app's blocks do: a tile or a
// back link opens a page of its tab, a link opens it in its tab.
function filesHelpers(nav: FilesNav): typeof files {
  const open = (tab: string): ReturnType<typeof parsePage> => parsePage(library.page(tab))
  return {
    ...nav,
    // Albums: the open album, null for the grid
    shownAlbum(): string | null {
      const p = open('albums')
      return p?.kind === 'album' ? p.id : null
    },
    openAlbum(id: string | null): void {
      library.openPage('albums', id ? albumPage(id) : '')
    },
    // Artists: the open artist (null for the grid), and an album opened from it
    shownArtist(): { key: string | null; album: string | null } {
      const p = open('artists')
      return p?.kind === 'artist'
        ? { key: p.key, album: p.album ?? null }
        : { key: null, album: null }
    },
    // null goes back to the artist
    openArtistAlbum(id: string | null): void {
      const p = open('artists')
      if (p?.kind === 'artist') library.openPage('artists', artistPage(p.key, id))
    },
    // Folders: the open folder by key, null for the top
    shownFolderKey(): string | null {
      const p = open('folders')
      return p?.kind === 'folder' ? p.key : null
    },
    // the path bar and subfolders keep the search text
    openFolder(key: string | null): void {
      library.openPage('folders', key ? folderPage(key) : '', true)
    },
    // a link, as from the album page's folder line
    showFolder(key: string): void {
      p.openPage({ plugin: 'files', page: folderPage(key) })
    }
  }
}

// what App's effect does when a plugin is turned on or off
const tabsChanged = (): void => library.setTabs(p.navTabs())

// a fresh store each time, so no history carries over; Studio's chips
beforeEach(async () => {
  vi.resetModules()
  library = (await import('./library.svelte')).library
  settings = (await import('./settings.svelte')).settings
  p = await import('../plugins')
  files = filesHelpers(await import('../plugins/files/nav'))
  const mfpNav = await import('../plugins/mfp/nav')
  mfp = {
    openEpisode: (id) => library.openPage('mfp', id ? mfpNav.episodePage(id) : ''),
    shownEpisode: () => mfpNav.episodeOf(library.page('mfp'))
  }
  mfpStore = (await import('../plugins/mfp/store.svelte')).mfp
  settings.plugins = { files: true, radio: true, mfp: true }
  library.load(lib('a', 'b'))
  tabsChanged()
  library.showIn('chips')
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
    files.openAlbum('a')
    library.back()
    expect(files.shownAlbum()).toBeNull()
    library.forward()
    expect(files.shownAlbum()).toBe('a')
  })

  it('does nothing with no history, and says so for the buttons', () => {
    expect([library.canBack, library.canForward]).toEqual([false, false])
    library.back()
    library.forward()
    expect([library.tab, files.shownAlbum()]).toEqual(['albums', null])
  })

  it('a new step drops what was ahead', () => {
    files.openAlbum('a')
    library.back()
    files.openAlbum('b')
    expect(library.canForward).toBe(false)
    library.back()
    library.forward()
    expect(files.shownAlbum()).toBe('b')
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
    files.openAlbum('a')
    files.showFolder(folder)
    expect([library.tab, files.shownFolderKey()]).toEqual(['folders', folder])
    library.back()
    expect([library.tab, files.shownAlbum()]).toEqual(['albums', 'a'])
    library.forward()
    expect([library.tab, files.shownFolderKey()]).toEqual(['folders', folder])
  })

  it('each chip keeps its page while another one shows', () => {
    files.openAlbum('a')
    library.pickTab('folders')
    files.openFolder('k')
    library.pickTab('albums')
    expect(files.shownAlbum()).toBe('a')
    library.pickTab('folders')
    expect(files.shownFolderKey()).toBe('k')
  })

  it('the chip shown goes to its top, as a step', () => {
    files.openAlbum('a')
    library.pickTab('albums')
    expect(files.shownAlbum()).toBeNull()
    library.back()
    expect(files.shownAlbum()).toBe('a')
    library.pickTab('artists')
    files.openArtist('x')
    files.openArtistAlbum('a')
    library.pickTab('artists')
    expect(files.shownArtist()).toEqual({ key: null, album: null })
    library.pickTab('folders')
    files.openFolder('k')
    library.pickTab('folders')
    expect(files.shownFolderKey()).toBeNull()
  })

  it('Back goes up a folder, one step at a time', () => {
    files.openFolder('a')
    files.openFolder('b')
    library.back()
    expect(files.shownFolderKey()).toBe('a')
  })

  it('a step is not taken for the place already shown', () => {
    files.openAlbum('a')
    files.openAlbum('a')
    library.back()
    expect(files.shownAlbum()).toBeNull()
    expect(library.canBack).toBe(false)
  })

  it('skips an album a rescan removed', () => {
    library.pickTab('radio')
    library.pickTab('albums')
    files.openAlbum('b')
    library.pickTab('radio')
    library.load(lib('a'))
    library.back()
    // "b" is gone, so that step is the Albums grid
    expect([library.tab, files.shownAlbum()]).toEqual(['albums', null])
    library.back()
    // the grid again would change nothing, so it goes on to Radio
    expect(library.tab).toBe('radio')
  })

  it('brings back the search text a step had', () => {
    library.query = 'blue'
    library.showAll('files:albums')
    files.openAlbum('a')
    expect([library.query, library.searchAll]).toEqual(['', null])
    library.back()
    expect([library.query, library.searchAll, files.shownAlbum()]).toEqual([
      'blue',
      'files:albums',
      null
    ])
    // typing is not a step
    library.query = 'blue h'
    library.back()
    expect([library.query, library.searchAll]).toEqual(['blue', null])
  })

  it('says once that a place seen before is shown, for the scroll place', () => {
    files.openAlbum('a')
    expect(library.takeReturn()).toBe(false)
    library.back()
    expect(library.takeReturn()).toBe(true)
    expect(library.takeReturn()).toBe(false)
    library.pickTab('folders')
    expect(library.takeReturn()).toBe(true)
    library.pickTab('albums')
    files.openAlbum('b')
    expect(library.takeReturn()).toBe(false)
  })

  it('does not say so when a pick changed nothing', () => {
    library.pickTab('albums')
    library.takeReturn()
    // Studio has no Songs: the pick lands on the place shown
    library.pickTab('songs')
    expect([library.tab, library.takeReturn()]).toEqual(['albums', false])
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
    files.openArtist('x')
    files.openArtistAlbum('a')
    library.back()
    expect(files.shownArtist()).toEqual({ key: 'x', album: null })
    library.back()
    expect(files.shownArtist()).toEqual({ key: null, album: null })
    // an album opened from an artist is not the Albums chip's
    expect(files.shownAlbum()).toBeNull()
    library.forward()
    library.forward()
    expect(files.shownArtist()).toEqual({ key: 'x', album: 'a' })
  })

  it('closes an artist a rescan removed, and Forward skips it', () => {
    files.openArtist('x')
    library.back()
    const gone = lib('a')
    gone.albums[0].artist = 'Y'
    library.load(gone)
    library.forward()
    expect(files.shownArtist().key).toBeNull()
    files.openArtist('y')
    library.load(lib('a'))
    expect(files.shownArtist().key).toBeNull()
  })

  it('follows an artist that was renamed or split to its new key (ticket 024)', () => {
    const named = (artist: string): LibraryData => {
      const d = lib('a')
      d.albums[0].artist = artist
      return d
    }
    files.openArtist('x')
    files.followArtist('кино')
    // a scan's patch that comes before the edit's changes nothing
    library.load(lib('a'))
    expect(files.shownArtist().key).toBe('x')
    library.load(named('Кино'))
    expect(files.shownArtist().key).toBe('кино')
    // used once: a later rescan that drops the artist closes it
    library.load(named('Y'))
    expect(files.shownArtist().key).toBeNull()
  })

  it('does not follow after another artist was opened', () => {
    files.openArtist('x')
    files.followArtist('кино')
    files.openArtist('x')
    const d = lib('a')
    d.albums[0].artist = 'Кино'
    library.load(d)
    expect(files.shownArtist().key).toBeNull()
  })

  it('follows from an album of the artist opened meanwhile, not from the grid', () => {
    const named = (artist: string): LibraryData => {
      const d = lib('a')
      d.albums[0].artist = artist
      return d
    }
    files.openArtist('x')
    files.followArtist('кино')
    library.openPage('artists', 'album/a/artist/x')
    library.load(named('Кино'))
    expect(files.shownArtist()).toEqual({ key: 'кино', album: 'a' })
    files.followArtist('y')
    library.openPage('artists', '')
    library.openPage('artists', 'album/a/artist/кино')
    library.load(named('Y'))
    expect(files.shownArtist().key).toBeNull()
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
    files.openAlbum('b')
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
    expect(files.shownAlbum()).toBe('b')
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
    files.openAlbum('b')
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
    expect(files.shownAlbum()).toBeNull()
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
    files.openFolder(library.folders.nodes[1].key)
    files.openArtist('y')
    const open = files.shownFolderKey()
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
    expect(files.shownFolderKey()).toBe(open)
    expect(
      library.folders.nodes[library.folders.byKey.get(open!)!].tracks.map((t) => t.id)
    ).toEqual(['b1'])
    expect(files.shownArtist().key).toBe('y')
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
    files.openAlbum('a')
    library.query = 'metal'
    library.pickTab('artists')
    expect(library.query).toBe('')
    library.query = 'metal'
    library.pickTab('albums')
    expect(library.query).toBe('')
    // another chip keeps its page (ticket 051)
    expect(files.shownAlbum()).toBe('a')
  })

  it("is cleared by a click on Classic's playlist shown, as a step", () => {
    library.showIn('sidebar')
    library.pickTab('playlists', 'playlist/p1')
    library.query = 'blue'
    library.pickTab('playlists', 'playlist/p1')
    expect([library.openPlaylist, library.query]).toEqual(['p1', ''])
    library.back()
    expect([library.openPlaylist, library.query]).toEqual(['p1', 'blue'])
  })

  it('is cleared when another section is picked', () => {
    library.showIn('sidebar')
    library.pickTab('radio')
    library.query = 'jazz'
    library.pickTab('songs')
    expect(library.tab).toBe('songs')
    expect(library.query).toBe('')
  })

  it('does not close the open album while typing', () => {
    files.openAlbum('a')
    library.query = 'harbor'
    expect(files.shownAlbum()).toBe('a')
    library.query = ''
    expect(files.shownAlbum()).toBe('a')
  })

  it('"Show all" goes back to the results when the text is cleared', () => {
    library.query = 'harbor'
    library.showAll('files:songs')
    library.query = 'harbor l'
    expect(library.searchAll).toBe('files:songs')
    library.query = ' '
    expect(library.searchAll).toBeNull()
    library.query = 'harbor'
    library.showAll('files:albums')
    library.pickTab('artists')
    expect(library.searchAll).toBeNull()
  })
})

describe('links from what plays (ticket 040)', () => {
  const album = (id: string, item?: string): void =>
    p.openPage({ plugin: 'files', page: `album/${id}`, ...(item ? { item } : {}) })

  it('opens an album in Albums, from any tab, with no search', () => {
    library.pickTab('radio')
    files.openArtist('x')
    library.query = 'blue'
    album('a', 'a/1')
    expect([library.tab, files.shownAlbum()]).toEqual(['albums', 'a'])
    // the Artists tab keeps its page (ticket 051)
    expect(files.shownArtist().key).toBe('x')
    expect(library.query).toBe('')
    expect(library.landing).toEqual({ song: 'a/1' })
  })

  it('does nothing for an album a rescan removed', () => {
    library.pickTab('radio')
    album('gone')
    expect([library.tab, files.shownAlbum()]).toEqual(['radio', null])
  })

  it('opens an artist in Artists, as a new step for Forward', () => {
    files.openArtist('x')
    files.openArtistAlbum('a')
    library.back()
    library.pickTab('albums')
    files.openAlbum('b')
    files.showArtist('x')
    expect([library.tab, files.shownArtist()]).toEqual(['artists', { key: 'x', album: null }])
    // a new step: Forward has nothing to reopen
    expect(library.canForward).toBe(false)
    library.back()
    expect([library.tab, files.shownAlbum()]).toEqual(['albums', 'b'])
    library.landing = null
    files.showArtist('nobody')
    expect(files.shownArtist().key).toBe('x')
    // nothing opened, so nothing to scroll
    expect(library.landing).toBeNull()
  })

  it('opens a playlist in both templates, and Radio', () => {
    library.showPlaylist('p1')
    expect([library.tab, library.openPlaylist]).toEqual(['playlists', 'p1'])
    p.openPage({ plugin: 'radio', page: '' })
    // the Playlists tab keeps its page (ticket 051)
    expect([library.tab, library.openPlaylist]).toEqual(['radio', 'p1'])
  })

  it('opens what "From" names', () => {
    const from = (kind: Parameters<typeof queueLink>[0], id: string): void => {
      const l = queueLink(kind, id)
      if (l.plugin === 'core') library.showPlaylist(id)
      else p.openPage({ plugin: l.plugin, page: l.page })
    }
    library.load({
      ...lib('a', 'b'),
      folders: [{ name: '/m', parent: -1 }]
    })
    from('album', 'b')
    expect([library.tab, files.shownAlbum(), library.landing]).toEqual([
      'albums',
      'b',
      { song: null }
    ])
    from('artist', 'x')
    expect([library.tab, files.shownArtist().key]).toEqual(['artists', 'x'])
    from('playlist', 'p1')
    expect(library.openPlaylist).toBe('p1')
    from('folder', '/m')
    expect([library.tab, files.shownFolderKey()]).toEqual(['folders', '/m'])
    // every link starts its page at the top, also one already open
    expect(library.landing).toEqual({ song: null })
  })

  it('says whether "From" still has something to open', () => {
    const can = (kind: Parameters<typeof queueLink>[0], id: string): boolean => {
      const l = queueLink(kind, id)
      return l.plugin !== 'core' && p.canOpen({ plugin: l.plugin, page: l.page })
    }
    expect(can('album', 'a')).toBe(true)
    expect(can('album', 'gone')).toBe(false)
    expect(can('artist', 'x')).toBe(true)
    expect(can('artist', 'y')).toBe(false)
    expect(can('folder', 'nowhere')).toBe(false)
  })
})

describe('Music For Programming (tickets 052, 061)', () => {
  // episode 'e' with songs e1 and e2
  const episodes = (...ids: string[]): MfpEpisodes => ({
    episodes: ids.map((id) => ({
      id,
      title: `Episode ${id}`,
      artist: 'Mixer',
      year: 0,
      link: '',
      length: 2,
      songs: [1, 2].map((n) => ({
        id: `${id}${n}`,
        title: 'S',
        artist: 'G',
        start: n - 1,
        length: 1
      }))
    }))
  })

  beforeEach(() => {
    library.load(lib('a'))
    mfpStore.load(episodes('e'))
  })

  it('opens an episode in the MFP chip, and Back goes to the list', () => {
    library.pickTab('mfp')
    mfp.openEpisode('e')
    expect([library.tab, mfp.shownEpisode()]).toEqual(['mfp', 'e'])
    library.back()
    expect(mfp.shownEpisode()).toBeNull()
  })

  it('a link to an episode opens it in the MFP tab', () => {
    p.openPage({ plugin: 'mfp', page: 'episode/e', item: 'e2' })
    expect([library.tab, mfp.shownEpisode()]).toEqual(['mfp', 'e'])
    expect(files.shownAlbum()).toBeNull()
    expect(library.landing).toEqual({ song: 'e2' })
  })

  it('a link to a local album still opens Albums', () => {
    p.openPage({ plugin: 'files', page: 'album/a' })
    expect([library.tab, files.shownAlbum()]).toEqual(['albums', 'a'])
  })

  it('the MFP chip picked again goes back to the list', () => {
    library.pickTab('mfp')
    mfp.openEpisode('e')
    library.pickTab('mfp')
    expect(mfp.shownEpisode()).toBeNull()
  })

  it('closes an episode that is gone once MFP has new data', () => {
    library.pickTab('mfp')
    mfp.openEpisode('e')
    mfpStore.load(episodes('x'))
    expect(mfp.shownEpisode()).toBe('e')
    library.pagesChanged()
    expect([library.tab, mfp.shownEpisode()]).toEqual(['mfp', null])
  })

  it('keeps its episodes out of the library', () => {
    expect(library.albums.map((a) => a.id)).toEqual(['a'])
    expect(library.findAlbum('e')).toBeUndefined()
  })
})

describe('tabs from the plugins that are on (ticket 059)', () => {
  function withEpisode(): void {
    library.load(lib('a'))
    const songs = [{ id: 'e1', title: 'S', artist: 'G', start: 0, length: 1 }]
    mfpStore.load({
      episodes: [{ id: 'e', title: 'E', artist: 'M', year: 0, link: '', length: 1, songs }]
    })
  }

  it('goes back and forward across two plugins tabs, each keeping its page', () => {
    withEpisode()
    library.pickTab('mfp')
    mfp.openEpisode('e')
    library.pickTab('albums')
    files.openAlbum('a')
    library.back()
    expect([library.tab, files.shownAlbum()]).toEqual(['albums', null])
    library.back()
    expect([library.tab, mfp.shownEpisode()]).toEqual(['mfp', 'e'])
    library.pickTab('albums')
    library.pickTab('mfp')
    expect(mfp.shownEpisode()).toBe('e')
    library.forward()
    expect(library.canForward).toBe(false)
  })

  it('a plugin turned off leaves its tabs, its pages and its history steps', () => {
    withEpisode()
    library.pickTab('mfp')
    mfp.openEpisode('e')
    library.pickTab('albums')
    files.openAlbum('a')
    library.pickTab('radio')
    library.query = 'jazz'
    settings.plugins = { files: true, radio: false, mfp: false }
    tabsChanged()
    // the first tab still shown, with no text: it was for stations
    expect([library.tab, library.query, files.shownAlbum()]).toEqual(['albums', '', 'a'])
    expect(library.page('mfp')).toBe('')
    library.back()
    expect([library.tab, files.shownAlbum()]).toEqual(['albums', null])
    // the MFP steps are now this same place
    expect(library.canBack).toBe(false)
    // on again: the tab is there, at its top
    settings.plugins = { files: true, radio: true, mfp: true }
    tabsChanged()
    library.pickTab('mfp')
    expect(mfp.shownEpisode()).toBeNull()
  })

  it('shows nothing with no plugin on', () => {
    library.setTabs([])
    expect(library.tab).toBe('')
    library.pickTab('albums')
    expect(library.tab).toBe('')
  })

  it('has Classic show its Songs and its playlists, and Studio neither', () => {
    library.showIn('sidebar')
    // still the tab Studio showed
    expect(library.tab).toBe('albums')
    library.pickTab('songs')
    library.pickTab('playlists', 'playlist/p1')
    expect([library.tab, library.openPlaylist]).toEqual(['playlists', 'p1'])
    library.showIn('chips')
    expect(library.tab).toBe('playlists')
    library.openPlaylistPage(null)
    // Classic has no list of playlists to show
    library.showIn('sidebar')
    expect(library.tab).toBe('songs')
    library.showIn('chips')
    expect(library.tab).toBe('albums')
  })

  it('starts on the first tab of the library drawn', async () => {
    vi.resetModules()
    library = (await import('./library.svelte')).library
    p = await import('../plugins')
    library.setTabs(p.navTabs())
    library.showIn('sidebar')
    expect(library.tab).toBe('songs')
  })

  it('a page that is gone closes, in the view and in its steps', () => {
    files.openAlbum('b')
    library.pickTab('radio')
    library.load(lib('a'))
    expect(library.page('albums')).toBe('')
    library.back()
    expect([library.tab, files.shownAlbum()]).toEqual(['albums', null])
  })
})
