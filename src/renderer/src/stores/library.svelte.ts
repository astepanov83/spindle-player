// Library data plus view state. The view state lives here, not in the part,
// so a layout rebuild keeps the open album, search, sort and section.
// Main sends the data from the index at start, then what changed while scans
// run (patches, see library-patch.ts).
import type { Album, Art, LibraryData, ScanStatus, Track } from '../../../shared/library'
import {
  applyPatch,
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

export type Chip = 'albums' | 'artists' | 'folders' | 'playlists'
// sidebar sections; playlists are "pl:<id>"
export type Section = 'songs' | 'albums' | 'artists' | 'folders' | `pl:${string}`
// the pages the mouse Back and Forward buttons close and reopen
export type Page = 'open' | 'openPlaylist'

class LibraryStore {
  // plain arrays, not deep proxies: they can hold 50k+ songs
  albums: Album[] = $state.raw([])
  #tracks = new Map<string, Track>()
  #order = new Map<string, number>()
  #albumIndex = new Map<string, number>()
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
  // the page mouse Back last closed, for Forward to reopen
  #closed: { page: Page; id: string } | null = null
  // which library main sent last, so a patch is only put on the one it was made from
  sent: LibraryVersion | undefined

  load(data: LibraryData & Partial<LibraryVersion>): void {
    this.#tracks = new Map(data.tracks.map((t) => [t.id, t]))
    this.#setAlbums(data.albums)
    if (data.epoch !== undefined && data.n !== undefined)
      this.sent = { epoch: data.epoch, n: data.n }
  }

  // Puts a patch on the library shown. Songs and albums that did not change
  // keep their objects, and the album list stays the same list when no album
  // changed, so the grid and tables don't redo more than they must. Throws
  // when it doesn't fit (the caller asks for the whole library then). Returns
  // whether songs left the library.
  patch(p: LibraryPatch): boolean {
    this.#setAlbums(applyPatch(this.albums, this.#tracks, p))
    this.sent = { epoch: p.epoch, n: p.n }
    return p.goneTracks.length > 0
  }

  #setAlbums(albums: Album[]): void {
    // library order is album order, then each album's own
    this.#order = new Map(albums.flatMap((a) => a.trackIds).map((id, i) => [id, i]))
    this.#albumIndex = new Map(albums.map((a, i) => [a.id, i]))
    if (albums !== this.albums) this.albums = albums
    this.#version++
    // the open album may be gone after a rescan
    if (this.open && !this.#albumIndex.has(this.open)) this.open = null
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

  // Mouse Back: from an album or playlist page to its list.
  back(page: Page): void {
    const id = this[page]
    if (!id) return
    this[page] = null
    this.#closed = { page, id }
  }

  // Mouse Forward: reopens what Back closed, if it is still there.
  forward(page: Page): void {
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

  // bumped by every library the page gets
  get revision(): number {
    return this.#version
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
