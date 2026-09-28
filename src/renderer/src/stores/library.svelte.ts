// Library data plus view state. The view state lives here, not in the part,
// so a layout rebuild keeps the open album, search, sort and section.
// Main sends the data (from the index, then after each scan that changed something).
import { listArtists, type Artist } from '../../../shared/artists'
import type {
  Album,
  Art,
  ArtistPhoto,
  LibraryData,
  ScanStatus,
  Track
} from '../../../shared/library'
import {
  nextPlaylistSort,
  withPlaylistSort,
  type PlaylistSorts,
  type Sort,
  type SortKey
} from '../library/views'
import {
  emptyTree,
  folderBack,
  folderForward,
  folderTree,
  openFolder,
  type FolderNav,
  type FolderTree
} from '../library/folders'
import {
  artistBack,
  artistForward,
  goToArtist,
  type ArtistNav,
  type ArtistPlace
} from '../library/artists'

export type Chip = 'albums' | 'artists' | 'folders' | 'playlists'
// sidebar sections; playlists are "pl:<id>"
export type Section = 'songs' | 'albums' | 'artists' | 'folders' | `pl:${string}`
// the pages the mouse Back and Forward buttons close and reopen; in
// Folders they go up a folder and back down, in Artists from an album to
// its artist to the grid and back
export type Page = 'open' | 'openPlaylist' | 'folder' | 'artist'

class LibraryStore {
  // plain arrays, not deep proxies: they can hold 50k+ songs
  albums: Album[] = $state.raw([])
  #tracks = new Map<string, Track>()
  #order = new Map<string, number>()
  #albumIndex = new Map<string, number>()
  folders: FolderTree = $state.raw(emptyTree())
  // name order (see shared/artists.ts)
  artists: Artist[] = $state.raw([])
  #artistIndex = new Map<string, number>()
  // artist key -> photo found online
  photos: Readonly<Record<string, ArtistPhoto>> = $state.raw({})
  // The maps above are plain, so Svelte can't see them change. Every reader
  // touches this, so a $derived that looked up a track runs again after a load.
  #version = $state(0)

  status: ScanStatus = $state.raw({
    folders: [],
    phase: 'idle',
    done: 0,
    total: 0,
    tracks: 0,
    albums: 0,
    failed: 0,
    missing: []
  })
  // The page could not get or read a library from main. Kept apart from the
  // status, which main sends often, so the next status doesn't hide it.
  loadFailed = $state(false)

  chip: Chip = $state('albums')
  section: Section = $state('songs')
  // album id of the open album page, or null for the grid
  open: string | null = $state(null)
  // Studio's Playlists chip: the open playlist, or null for the list
  openPlaylist: string | null = $state(null)
  query = $state('')
  sort: Sort = $state({ k: 'a', dir: 1 })
  // Playlists show in their own order until a column is clicked. Each keeps
  // its sort while the app runs; it is not saved.
  playlistSorts: PlaylistSorts = $state.raw({})
  // The open folder by key (see folders.ts), null for the top. Change it with
  // openFolder, so Forward knows what Back left.
  #folderNav: FolderNav = $state.raw({ folder: null, below: [] })
  // Folders show songs in folder order until a column is clicked, like playlists.
  folderSort: Sort | null = $state(null)
  // The open artist's key, null for the grid. An album opened from it is
  // `open`. Change them with openArtist and openArtistAlbum, so Forward
  // knows what Back left.
  artist: string | null = $state(null)
  #artistAhead: ArtistPlace[] = []
  // "Also on" shows in library order until a column is clicked, like playlists.
  artistSort: Sort | null = $state(null)
  // the page mouse Back last closed, for Forward to reopen
  #closed: { page: Page; id: string } | null = null

  load(data: LibraryData): void {
    this.#tracks = new Map(data.tracks.map((t) => [t.id, t]))
    this.#order = new Map(data.tracks.map((t, i) => [t.id, i]))
    this.#albumIndex = new Map(data.albums.map((a, i) => [a.id, i]))
    this.albums = data.albums
    this.folders = folderTree(data.folders ?? [], data.tracks, (id) => {
      const i = this.#albumIndex.get(id)
      return i === undefined ? '' : data.albums[i].cover
    })
    this.artists = listArtists(data.albums, (id) => this.#tracks.get(id)!)
    this.#artistIndex = new Map(this.artists.map((a, i) => [a.key, i]))
    this.photos = data.artistPhotos ?? {}
    this.#version++
    // the open album or artist may be gone after a rescan
    if (this.open && !this.#albumIndex.has(this.open)) this.open = null
    if (this.artist && !this.#artistIndex.has(this.artist)) this.artist = null
  }

  // counts loads, for a picture that failed to show to try again after one
  get loads(): number {
    return this.#version
  }

  playlistSort(id: string): Sort | null {
    return this.playlistSorts[id] ?? null
  }

  sortPlaylist(id: string, k: SortKey): void {
    const sort = nextPlaylistSort(this.playlistSort(id), k)
    this.playlistSorts = withPlaylistSort(this.playlistSorts, id, sort)
  }

  // a deleted playlist's sort
  forgetPlaylistSort(id: string): void {
    if (id in this.playlistSorts)
      this.playlistSorts = withPlaylistSort(this.playlistSorts, id, null)
  }

  get folder(): string | null {
    return this.#folderNav.folder
  }

  openFolder(key: string | null): void {
    this.#folderNav = openFolder(this.#folderNav, key)
  }

  sortFolder(k: SortKey): void {
    this.folderSort = nextPlaylistSort(this.folderSort, k)
  }

  getArtist(key: string): Artist | undefined {
    const i = this.#artistIndex.get(key)
    return i === undefined ? undefined : this.artists[i]
  }

  get #artistNav(): ArtistNav {
    return { artist: this.artist, album: this.open, ahead: this.#artistAhead }
  }

  set #artistNav(nav: ArtistNav) {
    this.artist = nav.artist
    this.open = nav.album
    this.#artistAhead = nav.ahead
  }

  // null goes back to the grid
  openArtist(key: string | null): void {
    this.#artistNav = goToArtist(this.#artistNav, { artist: key, album: null })
  }

  openArtistAlbum(id: string): void {
    this.#artistNav = goToArtist(this.#artistNav, { artist: this.artist, album: id })
  }

  sortArtist(k: SortKey): void {
    this.artistSort = nextPlaylistSort(this.artistSort, k)
  }

  // Mouse Back: from an album or playlist page to its list, or up a folder.
  back(page: Page): void {
    if (page === 'folder') {
      this.#folderNav = folderBack(this.folders, this.#folderNav)
      return
    }
    if (page === 'artist') {
      this.#artistNav = artistBack(this.#artistNav)
      return
    }
    const id = this[page]
    if (!id) return
    this[page] = null
    this.#closed = { page, id }
  }

  // Mouse Forward: reopens what Back closed, if it is still there.
  forward(page: Page): void {
    if (page === 'folder') {
      this.#folderNav = folderForward(this.folders, this.#folderNav)
      return
    }
    if (page === 'artist') {
      this.#artistNav = artistForward(
        this.#artistNav,
        (p) =>
          (!p.artist || this.#artistIndex.has(p.artist)) &&
          (!p.album || this.#albumIndex.has(p.album))
      )
      return
    }
    const c = this.#closed
    if (!c || c.page !== page || this[page]) return
    if (page === 'open' && !this.#albumIndex.has(c.id)) return
    this[page] = c.id
    this.#closed = null
  }

  // a deleted playlist must not come back on Forward
  forgetClosed(id: string): void {
    if (this.#closed?.id === id) this.#closed = null
  }

  has(id: string): boolean {
    void this.#version
    return this.#tracks.has(id)
  }

  track(id: string): Track {
    void this.#version
    return this.#tracks.get(id)!
  }

  album(id: string): Album {
    void this.#version
    return this.albums[this.#albumIndex.get(id)!]
  }

  // the song's own picture, else its album's
  art(t: Track): Art {
    return t.art ?? this.album(t.albumId)
  }

  // position in the library, for stable sorting
  order(t: Track): number {
    void this.#version
    return this.#order.get(t.id) ?? 0
  }

  // the album after this song's album, wrapping around
  nextAlbumTracks(trackId: string): string[] {
    const i = this.#albumIndex.get(this.track(trackId).albumId) ?? -1
    return this.albums[(i + 1) % this.albums.length]?.trackIds ?? []
  }
}

export const library = new LibraryStore()

// Main sends the library as UTF-8 JSON bytes (see LibraryApi).
export function decodeLibrary(bytes: Uint8Array): LibraryData {
  return JSON.parse(new TextDecoder().decode(bytes)) as LibraryData
}
