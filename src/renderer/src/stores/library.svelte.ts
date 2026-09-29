// Library data plus view state. The view state lives here, not in the part,
// so a layout rebuild keeps the open album, search, sort and section.
// Main sends the data from the index at start, then what changed while scans
// run (patches, see library-patch.ts).
import { listArtists, type Artist } from '../../../shared/artists'
import type {
  Album,
  Art,
  ArtistPhoto,
  Folder,
  LibraryData,
  ScanStatus,
  Track
} from '../../../shared/library'
import {
  applyPatch,
  type HeldLibrary,
  type LibraryMessage,
  type LibraryPatch,
  type LibraryVersion
} from '../../../shared/library-patch'
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
  // the folder table main sent, which folderTree is built from
  #folderTable: Folder[] = []
  folders: FolderTree = $state.raw(emptyTree())
  // name order (see shared/artists.ts)
  artists: Artist[] = $state.raw([])
  #artistIndex = new Map<string, number>()
  // artist key -> photo found online
  photos: Readonly<Record<string, ArtistPhoto>> = $state.raw({})
  // The maps above are plain, so Svelte can't see them change. Every reader
  // touches this, so a $derived that looked up a track runs again after a
  // load. Not bumped by a patch with only photos: the song lists sort 50k rows.
  #version = $state(0)
  // bumped by every library and patch, photos alone too (see revision)
  #loads = $state(0)

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
  // the artist whose names are being edited (ticket 024)
  editingArtist: string | null = $state(null)
  // After an edit, the key the open artist has in the library that comes
  // back: a rename or split changes it.
  #follow: string | null = null
  // the page mouse Back last closed, for Forward to reopen
  #closed: { page: Page; id: string } | null = null
  // which library main sent last, so a patch is only put on the one it was made from
  sent: LibraryVersion | undefined

  load(data: LibraryData & Partial<LibraryVersion>): void {
    this.#tracks = new Map(data.tracks.map((t) => [t.id, t]))
    this.#show(
      { albums: data.albums, folders: data.folders ?? [], photos: data.artistPhotos ?? {} },
      true
    )
    if (data.epoch !== undefined && data.n !== undefined)
      this.sent = { epoch: data.epoch, n: data.n }
  }

  // Puts a patch on the library shown. Songs and albums that did not change
  // keep their objects, and the album list stays the same list when no album
  // changed, so the grid and tables don't redo more than they must. Throws
  // when it doesn't fit (the caller asks for the whole library then). Returns
  // whether songs left the library.
  patch(p: LibraryPatch): boolean {
    const held = applyPatch(
      { albums: this.albums, folders: this.#folderTable, photos: this.photos },
      this.#tracks,
      p
    )
    // a patch with only photos (the lookup found some) leaves the lists as they are
    const songs =
      p.tracks.length > 0 ||
      p.goneTracks.length > 0 ||
      held.albums !== this.albums ||
      held.folders !== this.#folderTable
    this.#show(held, songs)
    this.sent = { epoch: p.epoch, n: p.n }
    return p.goneTracks.length > 0
  }

  // `songs`: songs, albums or folders changed, so the lists made from them
  // are made again
  #show(held: HeldLibrary, songs: boolean): void {
    this.photos = held.photos
    if (songs) {
      const albums = held.albums
      // library order is album order, then each album's own
      const ids = albums.flatMap((a) => a.trackIds)
      this.#order = new Map(ids.map((id, i) => [id, i]))
      this.#albumIndex = new Map(albums.map((a, i) => [a.id, i]))
      if (albums !== this.albums) this.albums = albums
      this.#folderTable = held.folders
      const tracks = ids.map((id) => this.#tracks.get(id)!)
      this.folders = folderTree(held.folders, tracks, (id) => {
        const i = this.#albumIndex.get(id)
        return i === undefined ? '' : albums[i].cover
      })
      this.artists = listArtists(albums, (id) => this.#tracks.get(id)!)
      this.#artistIndex = new Map(this.artists.map((a, i) => [a.key, i]))
    }
    if (songs) this.#version++
    this.#loads++
    // the open album or artist may be gone after a rescan
    if (this.open && !this.#albumIndex.has(this.open)) this.open = null
    if (this.artist && !this.#artistIndex.has(this.artist)) {
      // kept until used: a scan's patch may come before the edit's
      const to = this.#follow && this.#artistIndex.has(this.#follow) ? this.#follow : null
      this.artist = to
      if (to) this.#follow = null
    }
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

  // The open artist is renamed or split: show `key` once it is in the library.
  followArtist(key: string): void {
    this.#follow = key
  }

  // null goes back to the grid
  openArtist(key: string | null): void {
    this.#follow = null
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

  // Bumped by every library the page gets, whole or a patch. A picture that
  // failed to show tries again after one, since a scan can make its small
  // file again at the same URL.
  get revision(): number {
    return this.#loads
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
export function decodeLibrary(bytes: Uint8Array): LibraryMessage {
  return JSON.parse(new TextDecoder().decode(bytes)) as LibraryMessage
}
