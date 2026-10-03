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
import { emptyTree, folderTree, type FolderTree } from '../library/folders'
import type { QueueLink } from '../../../shared/saved-queue'
import {
  emptyHistory,
  goBack,
  goForward,
  leave,
  mapSteps,
  type History,
  type Walk
} from '../library/history'

export type Chip = 'albums' | 'artists' | 'folders' | 'playlists' | 'radio' | 'mfp'
// sidebar sections; playlists are "pl:<id>"
export type Section = 'songs' | 'albums' | 'artists' | 'folders' | 'radio' | 'mfp' | `pl:${string}`
export type SearchGroup = 'songs' | 'albums' | 'artists' | 'mfp'

// Where the library is: the chip (Studio) or section (Classic), and the page
// open in each of them. Each chip keeps its page while another one shows, so
// going back to it shows what was left there. One object, so a step of
// history is a copy of it (ticket 051).
export interface Nav {
  chip: Chip
  section: Section
  // Albums: the open album, null for the grid
  album: string | null
  // Artists: the open artist (null for the grid), and an album opened from it
  artist: string | null
  artistAlbum: string | null
  // Folders: the open folder by key (see folders.ts), null for the top
  folder: string | null
  // Studio's Playlists chip: the open playlist, null for the list
  playlist: string | null
  // MFP: the open episode (an album id), null for the list (ticket 052)
  episode: string | null
  // the search results' group shown whole after "Show all", null for all groups
  searchAll: SearchGroup | null
}

// A step of history: the place and the search text it had, so Back to a
// search's results shows them again.
export interface Step {
  nav: Nav
  query: string
}

const startNav = (): Nav => ({
  chip: 'albums',
  section: 'songs',
  album: null,
  artist: null,
  artistAlbum: null,
  folder: null,
  playlist: null,
  episode: null,
  searchAll: null
})

const sameNav = (a: Nav, b: Nav): boolean =>
  (Object.keys(a) as (keyof Nav)[]).every((k) => a[k] === b[k])
const sameStep = (a: Step, b: Step): boolean => a.query === b.query && sameNav(a.nav, b.nav)

// The same list when every album in it is the same object, so views made
// from it don't redo their work.
function keepSame(old: Album[], next: Album[]): Album[] {
  return old.length === next.length && old.every((a, i) => a === next[i]) ? old : next
}

class LibraryStore {
  // plain arrays, not deep proxies: they can hold 50k+ songs
  // the albums of the music folders; every view but MFP lists only these
  albums: Album[] = $state.raw([])
  // Music For Programming episodes, newest first (ticket 052)
  mfpAlbums: Album[] = $state.raw([])
  // both, in the order main sent them; patches and lookups by id use it
  #allAlbums: Album[] = []
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

  // Change it with a step (#go), so Back can return, or Back and Forward.
  #nav: Nav = $state.raw(startNav())
  #history: History<Step> = $state.raw(emptyHistory())
  // Back, Forward or another chip shows a place seen before: it shows where
  // it was left, not the top. The scroll code takes it once (takeReturn).
  #returning = false
  #query = $state('')
  sort: Sort = $state({ k: 'a', dir: 1 })
  // Playlists show in their own order until a column is clicked. Each keeps
  // its sort while the app runs; it is not saved.
  playlistSorts: PlaylistSorts = $state.raw({})
  // Folders show songs in folder order until a column is clicked, like playlists.
  folderSort: Sort | null = $state(null)
  // "Also on" shows in library order until a column is clicked, like playlists.
  artistSort: Sort | null = $state(null)
  // the artist whose names are being edited (ticket 024)
  editingArtist: string | null = $state(null)
  // After an edit, the key the open artist has in the library that comes
  // back: a rename or split changes it.
  #follow: string | null = null
  // A link just opened a page (ticket 040): it starts at the top, also when
  // it was open already, or at `song`'s row. The library part's scroll code
  // takes it once.
  landing: { song: string | null } | null = $state.raw(null)
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
      { albums: this.#allAlbums, folders: this.#folderTable, photos: this.photos },
      this.#tracks,
      p
    )
    // a patch with only photos (the lookup found some) leaves the lists as they are
    const songs =
      p.tracks.length > 0 ||
      p.goneTracks.length > 0 ||
      held.albums !== this.#allAlbums ||
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
      this.#allAlbums = albums
      const local = keepSame(
        this.albums,
        albums.filter((a) => !a.online)
      )
      const online = keepSame(
        this.mfpAlbums,
        albums.filter((a) => a.online === 'mfp')
      )
      if (local !== this.albums) this.albums = local
      if (online !== this.mfpAlbums) this.mfpAlbums = online
      this.#folderTable = held.folders
      // online songs are in no folder
      const tracks = local.flatMap((a) => a.trackIds).map((id) => this.#tracks.get(id)!)
      this.folders = folderTree(held.folders, tracks, (id) => {
        const i = this.#albumIndex.get(id)
        return i === undefined ? '' : albums[i].cover
      })
      this.artists = listArtists(local, (id) => this.#tracks.get(id)!)
      this.#artistIndex = new Map(this.artists.map((a, i) => [a.key, i]))
    }
    if (songs) this.#version++
    this.#loads++
    // the open albums or artist may be gone after a rescan
    let nav = this.#fix(this.#nav)
    const a = this.#nav.artist
    if (a && !nav.artist) {
      // kept until used: a scan's patch may come before the edit's
      const to = this.#follow && this.#artistIndex.has(this.#follow) ? this.#follow : null
      if (to) {
        nav = { ...nav, artist: to, artistAlbum: this.#nav.artistAlbum }
        this.#follow = null
      }
    }
    if (!sameNav(nav, this.#nav)) this.#nav = nav
  }

  // What is left of a place after a rescan: an album or artist that is gone
  // closes. A folder that is gone shows the nearest one above (shownFolder).
  #fix(nav: Nav): Nav {
    const album = (id: string | null): string | null => (id && this.#albumIndex.has(id) ? id : null)
    const artist = nav.artist && this.#artistIndex.has(nav.artist) ? nav.artist : null
    const episode = nav.episode && this.#albumIndex.has(nav.episode) ? nav.episode : null
    return {
      ...nav,
      album: album(nav.album),
      artist,
      artistAlbum: artist ? album(nav.artistAlbum) : null,
      episode
    }
  }

  get chip(): Chip {
    return this.#nav.chip
  }
  get section(): Section {
    return this.#nav.section
  }
  // Albums' open album
  get open(): string | null {
    return this.#nav.album
  }
  get artist(): string | null {
    return this.#nav.artist
  }
  get artistAlbum(): string | null {
    return this.#nav.artistAlbum
  }
  get folder(): string | null {
    return this.#nav.folder
  }
  get openPlaylist(): string | null {
    return this.#nav.playlist
  }
  get episode(): string | null {
    return this.#nav.episode
  }
  get searchAll(): SearchGroup | null {
    return this.#nav.searchAll
  }

  // The search text. Typing never closes the open page: a view shows its
  // results over it, and clearing the text shows the page again. Typing is
  // not a step of history.
  get query(): string {
    return this.#query
  }

  set query(q: string) {
    this.#query = q
    if (!q.trim() && this.#nav.searchAll) this.#nav = { ...this.#nav, searchAll: null }
  }

  // A step: the place now goes on the history for Back. The search text goes
  // unless `keepQuery` (a folder opened while its search filters, "Show all").
  go(change: Partial<Nav>, keepQuery = false): void {
    const nav = { ...this.#nav, ...change }
    const query = keepQuery ? this.#query : ''
    const now = this.#step()
    this.#returning = false
    if (sameStep({ nav, query }, now)) return
    this.#history = leave(this.#history, now)
    this.#nav = nav
    this.query = query
  }

  #step(): Step {
    return { nav: this.#nav, query: this.#query }
  }

  get #walk(): Walk<Step> {
    return { fix: (s) => ({ ...s, nav: this.#fix(s.nav) }), same: sameStep }
  }

  // Whether Back and Forward would show something else: a step a rescan or
  // a delete made the same as the place shown doesn't count.
  get canBack(): boolean {
    void this.#version
    return goBack(this.#history, this.#step(), this.#walk) !== null
  }

  get canForward(): boolean {
    void this.#version
    return goForward(this.#history, this.#step(), this.#walk) !== null
  }

  // Mouse Back, Alt+Left and the ‹ button: the place left last, in any chip.
  back(): void {
    this.#show1(goBack(this.#history, this.#step(), this.#walk))
  }

  forward(): void {
    this.#show1(goForward(this.#history, this.#step(), this.#walk))
  }

  #show1(r: { h: History<Step>; to: Step } | null): void {
    if (!r) return
    this.#history = r.h
    this.#nav = r.to.nav
    this.#query = r.to.query
    this.#returning = true
  }

  // true once after Back, Forward or another chip: the view shows where it
  // was left (see scroll-top.svelte.ts)
  takeReturn(): boolean {
    const r = this.#returning
    this.#returning = false
    return r
  }

  // The other template shows other chips or sections: its history would
  // step through places it doesn't show.
  templateChanged(): void {
    this.#history = emptyHistory()
    this.query = ''
  }

  // A chip or section is picked. Another one shows the page it was left on;
  // the one shown goes to its top (the grid, the list). No search text: a
  // query for stations is no query for albums.
  pickChip(c: Chip): void {
    if (c !== this.chip) return this.#toTab({ chip: c })
    if (c === 'albums') this.go({ album: null, searchAll: null })
    else if (c === 'artists') this.openArtist(null)
    else if (c === 'folders') this.go({ folder: null })
    else if (c === 'playlists') this.go({ playlist: null })
    else if (c === 'mfp') this.go({ episode: null })
    else this.go({})
  }

  pickSection(s: Section): void {
    if (s !== this.section) return this.#toTab({ section: s })
    if (s === 'albums') this.go({ album: null, searchAll: null })
    else if (s === 'artists') this.openArtist(null)
    else if (s === 'folders') this.go({ folder: null })
    else if (s === 'mfp') this.go({ episode: null })
    else this.go({})
  }

  #toTab(change: Partial<Nav>): void {
    this.go({ ...change, searchAll: null })
    this.#returning = true
  }

  // An album from the Albums grid or the search results; null is the back link.
  openAlbum(id: string | null): void {
    this.go({ album: id, searchAll: null })
  }

  // "Show all" in the search results; null is "All results"
  showAll(group: SearchGroup | null): void {
    this.go({ searchAll: group }, true)
  }

  // An episode from the MFP list; null is the back link.
  openEpisode(id: string | null): void {
    this.go({ episode: id })
  }

  // Studio's playlist page; null is the list
  openPlaylistPage(id: string | null): void {
    this.go({ playlist: id })
  }

  playlistSort(id: string): Sort | null {
    return this.playlistSorts[id] ?? null
  }

  sortPlaylist(id: string, k: SortKey): void {
    const sort = nextPlaylistSort(this.playlistSort(id), k)
    this.playlistSorts = withPlaylistSort(this.playlistSorts, id, sort)
  }

  // A deleted playlist: the view and every step of history leave it.
  forgetPlaylist(id: string): void {
    if (id in this.playlistSorts)
      this.playlistSorts = withPlaylistSort(this.playlistSorts, id, null)
    const out = (n: Nav): Nav => ({
      ...n,
      section: n.section === `pl:${id}` ? 'songs' : n.section,
      playlist: n.playlist === id ? null : n.playlist
    })
    const nav = out(this.#nav)
    if (!sameNav(nav, this.#nav)) {
      // the text filtered the playlist's rows
      this.#nav = nav
      this.query = ''
    }
    this.#history = mapSteps(this.#history, (s) => ({ ...s, nav: out(s.nav) }), sameStep)
  }

  // Folders' path bar and subfolders. The search text stays, so a match
  // deeper down can be followed to.
  openFolder(key: string | null): void {
    this.go({ folder: key }, true)
  }

  sortFolder(k: SortKey): void {
    this.folderSort = nextPlaylistSort(this.folderSort, k)
  }

  getArtist(key: string): Artist | undefined {
    const i = this.#artistIndex.get(key)
    return i === undefined ? undefined : this.artists[i]
  }

  // The open artist is renamed or split: show `key` once it is in the library.
  followArtist(key: string): void {
    this.#follow = key
  }

  // null goes back to the grid
  openArtist(key: string | null): void {
    this.#follow = null
    this.go({ artist: key, artistAlbum: null })
  }

  // null goes back to the artist
  openArtistAlbum(id: string | null): void {
    this.go({ artistAlbum: id })
  }

  // Links from what plays and "Go to" in the song menu (ticket 040). Each is a
  // step, in both templates, since the store doesn't know which one shows.
  // Something a rescan removed opens nothing.
  #link(change: Partial<Nav>, song: string | null = null): void {
    this.go({ searchAll: null, ...change })
    this.landing = { song }
  }

  // `song`: the row to scroll into view
  showAlbum(id: string, song?: string): void {
    const i = this.#albumIndex.get(id)
    if (i === undefined) return
    if (this.#allAlbums[i].online === 'mfp')
      this.#link({ chip: 'mfp', section: 'mfp', episode: id }, song ?? null)
    else this.#link({ chip: 'albums', section: 'albums', album: id }, song ?? null)
  }

  showArtist(key: string): void {
    if (!this.#artistIndex.has(key)) return
    this.#follow = null
    this.#link({ chip: 'artists', section: 'artists', artist: key, artistAlbum: null })
  }

  showFolder(key: string): void {
    this.#link({ chip: 'folders', section: 'folders', folder: key })
  }

  showPlaylist(id: string): void {
    this.#link({ chip: 'playlists', section: `pl:${id}`, playlist: id })
  }

  showRadio(): void {
    this.#link({ chip: 'radio', section: 'radio' })
  }

  // Whether a link still has something to open after a rescan. Playlists
  // are not the library's: the caller checks those.
  canShow(link: QueueLink): boolean {
    void this.#version
    if (link.kind === 'album') return this.#albumIndex.has(link.id)
    if (link.kind === 'artist') return this.#artistIndex.has(link.id)
    if (link.kind === 'folder') return this.folders.byKey.has(link.id)
    return true
  }

  showFrom(link: QueueLink): void {
    if (link.kind === 'album') this.showAlbum(link.id)
    else if (link.kind === 'artist') this.showArtist(link.id)
    else if (link.kind === 'folder') this.showFolder(link.id)
    else this.showPlaylist(link.id)
  }

  sortArtist(k: SortKey): void {
    this.artistSort = nextPlaylistSort(this.artistSort, k)
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
    return this.#allAlbums[this.#albumIndex.get(id)!]
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
}

export const library = new LibraryStore()

// Main sends the library as UTF-8 JSON bytes (see LibraryApi).
export function decodeLibrary(bytes: Uint8Array): LibraryMessage {
  return JSON.parse(new TextDecoder().decode(bytes)) as LibraryMessage
}
