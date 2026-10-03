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
import type { NavKind } from '../plugins/types'
import {
  emptyHistory,
  goBack,
  goForward,
  leave,
  mapSteps,
  type History,
  type Walk
} from '../library/history'

// The core's own tab (spec "Pages and tabs"): its pages are "playlist/<id>".
export const playlistsTab = 'playlists'
export const playlistPage = (id: string): string => `playlist/${id}`

// Where the library is: the tab shown (a chip in Studio, a section in
// Classic) and the page open in each tab. Each tab keeps its page while
// another one shows, so going back to it shows what was left there. One
// object, so a step of history is a copy of it (ticket 051). Page strings
// are the plugins': the core only keeps them.
export interface Nav {
  tab: string
  // a tab not in it shows its top; never ''
  pages: Readonly<Record<string, string>>
  // the search results' group shown whole after "Show all" (its FoundGroup
  // key, "files:songs"), null for all groups
  searchAll: string | null
}

// What the store needs of a tab that shows: where, and what is left of its
// page after its plugin's data changed (PageHalf.keep).
export interface NavTab {
  id: string
  only?: NavKind
  keep?: (tab: string, page: string) => string
  // the plugin it belongs to: a search group of one with no tab is gone
  plugin?: string
}

// A renamed page to follow (see LibraryStore.follow). `to` gets the old page;
// `keeps`: pages of the tab that may open meanwhile and still follow (an
// album opened from the renamed artist).
export interface Follow {
  tab: string
  to: (page: string) => string
  keeps?: (page: string) => boolean
}

// A step of history: the place and the search text it had, so Back to a
// search's results shows them again.
export interface Step {
  nav: Nav
  query: string
}

const startNav = (): Nav => ({ tab: '', pages: {}, searchAll: null })

function samePages(a: Nav['pages'], b: Nav['pages']): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
}

const sameNav = (a: Nav, b: Nav): boolean =>
  a === b || (a.tab === b.tab && a.searchAll === b.searchAll && samePages(a.pages, b.pages))
const sameStep = (a: Step, b: Step): boolean => a.query === b.query && sameNav(a.nav, b.nav)

function withPage(pages: Nav['pages'], tab: string, page: string): Nav['pages'] {
  if ((pages[tab] ?? '') === page) return pages
  const out = { ...pages }
  if (page) out[tab] = page
  else delete out[tab]
  return out
}

// The same list when every album in it is the same object, so views made
// from it don't redo their work.
function keepSame(old: Album[], next: Album[]): Album[] {
  return old.length === next.length && old.every((a, i) => a === next[i]) ? old : next
}

class LibraryStore {
  // plain arrays, not deep proxies: they can hold 50k+ songs
  // in the order main sent them
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
  // A library came from main this run: a song not in it is gone, not on its way.
  loaded = $state(false)
  // The page could not get or read a library from main. Kept apart from the
  // status, which main sends often, so the next status doesn't hide it.
  loadFailed = $state(false)

  // Change it with a step (go), so Back can return, or Back and Forward.
  #nav: Nav = $state.raw(startNav())
  // the tabs of the plugins that are on (setTabs); null until told
  #tabs: NavTab[] | null = $state.raw(null)
  // which library draws them (showIn); null until one is drawn
  #kind: NavKind | null = $state.raw(null)
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
  // After an edit, the page the open one is now in the library that comes
  // back: a rename or split changes an artist's key (see follow).
  #follow: Follow | null = null
  // A link just opened a page (ticket 040): it starts at the top, also when
  // it was open already, or at `song`'s row. The library part's scroll code
  // takes it once.
  landing: { song: string | null } | null = $state.raw(null)
  // which library main sent last, so a patch is only put on the one it was made from
  sent: LibraryVersion | undefined

  load(data: LibraryData & Partial<LibraryVersion>): void {
    this.#tracks = new Map(data.tracks.map((t) => [t.id, t]))
    this.loaded = true
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
      const kept = keepSame(this.albums, albums)
      if (kept !== this.albums) this.albums = kept
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
    // the open pages may be gone after a rescan
    const was = this.#nav
    let nav = this.#fix(was)
    const f = this.#follow
    const from = f && was.pages[f.tab]
    if (f && from && nav.pages[f.tab] !== from) {
      // kept until used: a scan's patch may come before the edit's
      const to = this.#keep(f.tab, f.to(from))
      if (to) {
        nav = { ...nav, pages: withPage(nav.pages, f.tab, to) }
        this.#follow = null
      }
    }
    if (!sameNav(nav, was)) this.#nav = nav
  }

  #keep(tab: string, page: string): string {
    const t = this.#tabs?.find((t) => t.id === tab)
    return t?.keep && page ? t.keep(tab, page) : page
  }

  // What is left of a place: a page its plugin says is gone closes (or shows
  // one above it), a tab that left takes its page with it, and a tab not
  // shown gives way to the first one shown.
  #fix(nav: Nav): Nav {
    const tabs = this.#tabs
    if (!tabs) return nav
    const pages: Record<string, string> = {}
    for (const t of tabs) {
      const page = this.#keep(t.id, nav.pages[t.id] ?? '')
      if (page) pages[t.id] = page
    }
    const shown = (id: string): boolean => this.#shows(id, pages[id] ?? '')
    const tab = shown(nav.tab) ? nav.tab : (tabs.find((t) => shown(t.id))?.id ?? '')
    // a group of a plugin that is off is gone, so "Show all" has nothing to show
    const gone =
      nav.searchAll !== null &&
      tabs.some((t) => t.plugin) &&
      !tabs.some((t) => t.plugin === nav.searchAll!.split(':')[0])
    const out: Nav = {
      tab,
      pages: samePages(pages, nav.pages) ? nav.pages : pages,
      searchAll: tab === nav.tab && !gone ? nav.searchAll : null
    }
    return sameNav(out, nav) ? nav : out
  }

  #shows(id: string, page: string): boolean {
    const t = this.#tabs?.find((t) => t.id === id)
    const kind = this.#kind
    if (!t || (kind && t.only && t.only !== kind)) return false
    // Classic lists the playlists, it has no Playlists page
    return !(kind === 'sidebar' && id === playlistsTab && !page)
  }

  // A step whose tab is gone drops its search text with it: a query for
  // stations is no query for albums.
  #fixStep(s: Step): Step {
    const nav = this.#fix(s.nav)
    return nav === s.nav ? s : { nav, query: nav.tab === s.nav.tab ? s.query : '' }
  }

  // The plugins' tabs changed (one turned on or off): the view and every
  // step of history leave the tabs that went.
  setTabs(list: NavTab[]): void {
    const old = this.#tabs
    const same = (t: NavTab, i: number): boolean =>
      t.id === list[i].id && t.only === list[i].only && t.keep === list[i].keep
    if (old && old.length === list.length && old.every(same)) return
    this.#tabs = list
    this.#refit()
  }

  // A plugin has new data: its pages that are gone close, in the view and in
  // every step of history.
  pagesChanged(): void {
    if (this.#tabs) this.#refit()
  }

  // The library on screen: Studio's chips or Classic's sidebar. A tab the
  // other one doesn't show gives way to its first.
  showIn(kind: NavKind): void {
    if (kind === this.#kind) return
    this.#kind = kind
    this.#refit()
  }

  #refit(): void {
    const now = this.#fixStep(this.#step())
    this.#nav = now.nav
    this.#query = now.query
    this.#history = mapSteps(this.#history, (s) => this.#fixStep(s), sameStep)
  }

  get tab(): string {
    return this.#nav.tab
  }

  // the page open in a tab, '' for its top
  page(tab: string): string {
    return this.#nav.pages[tab] ?? ''
  }

  get searchAll(): string | null {
    return this.#nav.searchAll
  }

  // Studio's playlist page; also Classic's playlist shown
  get openPlaylist(): string | null {
    const p = this.page(playlistsTab)
    return p.startsWith('playlist/') ? p.slice('playlist/'.length) : null
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
  // False when it changed nothing.
  go(change: Partial<Nav>, keepQuery = false): boolean {
    const nav = this.#fix({ ...this.#nav, ...change })
    const query = keepQuery ? this.#query : ''
    const now = this.#step()
    this.#returning = false
    if (sameStep({ nav, query }, now)) return false
    this.#history = leave(this.#history, now)
    this.#nav = nav
    this.query = query
    return true
  }

  #step(): Step {
    return { nav: this.#nav, query: this.#query }
  }

  get #walk(): Walk<Step> {
    return { fix: (s) => this.#fixStep(s), same: sameStep }
  }

  // Whether Back and Forward would show something else: a step a rescan or
  // a delete made the same as the place shown doesn't count.
  get canBack(): boolean {
    void this.#version
    void this.#tabs
    return goBack(this.#history, this.#step(), this.#walk) !== null
  }

  get canForward(): boolean {
    void this.#version
    void this.#tabs
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

  // A chip or section is picked; `page`: Classic's playlist. Another one
  // shows the page it was left on; the one shown goes to its top (the grid,
  // the list). No search text: a query for stations is no query for albums.
  pickTab(tab: string, page?: string): void {
    if (tab === this.tab && page === undefined) {
      if (this.#follow?.tab === tab) this.#follow = null
      this.go({ pages: withPage(this.#nav.pages, tab, ''), searchAll: null })
      return
    }
    // the page shown (Classic's playlist): only its search text goes, as a step
    if (tab === this.tab && page === this.page(tab)) {
      this.go({})
      return
    }
    const pages = page === undefined ? this.#nav.pages : withPage(this.#nav.pages, tab, page)
    if (this.go({ tab, pages, searchAll: null })) this.#returning = true
  }

  // A page of a tab from inside it (a tile, a back link, the path bar); ''
  // is the tab's top. The search text stays when `keepQuery` (a folder
  // opened while its search filters, so a match deeper down can be followed).
  openPage(tab: string, page: string, keepQuery = false): void {
    // another page picked in a renamed one's tab: it is not followed there
    const f = this.#follow
    if (f?.tab === tab && page !== this.page(tab) && !f.keeps?.(page)) this.#follow = null
    this.go({ tab, pages: withPage(this.#nav.pages, tab, page), searchAll: null }, keepQuery)
  }

  // Links from what plays and "Go to" in the song menu (ticket 040). Each is a
  // step, in both templates. `song`: the row to scroll into view. The caller
  // checks the page is still there (plugins' canOpen).
  link(tab: string, page: string, song: string | null = null): void {
    if (this.#follow?.tab === tab) this.#follow = null
    this.openPage(tab, page)
    this.landing = { song }
  }

  // The open page of `tab` is renamed (an artist's names were edited): once
  // the library has the page `to` gives for the old one, it shows that. Null
  // forgets it.
  follow(f: Follow | null): void {
    this.#follow = f
  }

  // "Show all" in the search results; null is "All results"
  showAll(group: string | null): void {
    this.go({ searchAll: group }, true)
  }

  // Studio's playlist page; null is the list
  openPlaylistPage(id: string | null): void {
    this.openPage(playlistsTab, id ? playlistPage(id) : '')
  }

  showPlaylist(id: string): void {
    this.link(playlistsTab, playlistPage(id))
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
    const page = playlistPage(id)
    const out = (n: Nav): Nav =>
      n.pages[playlistsTab] === page
        ? this.#fix({ ...n, pages: withPage(n.pages, playlistsTab, '') })
        : n
    const was = this.#nav
    const nav = out(was)
    if (!sameNav(nav, was)) {
      this.#nav = nav
      // the text filtered the playlist's rows
      if (was.tab === playlistsTab) this.query = ''
    }
    this.#history = mapSteps(this.#history, (s) => ({ ...s, nav: out(s.nav) }), sameStep)
  }

  sortFolder(k: SortKey): void {
    this.folderSort = nextPlaylistSort(this.folderSort, k)
  }

  getArtist(key: string): Artist | undefined {
    const i = this.#artistIndex.get(key)
    return i === undefined ? undefined : this.artists[i]
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

  // one lookup for "has" and "track": the queue asks for 50k songs
  find(id: string): Track | undefined {
    void this.#version
    return this.#tracks.get(id)
  }

  album(id: string): Album {
    void this.#version
    return this.albums[this.#albumIndex.get(id)!]
  }

  findAlbum(id: string): Album | undefined {
    void this.#version
    const i = this.#albumIndex.get(id)
    return i === undefined ? undefined : this.albums[i]
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
