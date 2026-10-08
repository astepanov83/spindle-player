// What the core asks a plugin's page half about its items. See
// work/specs/plugins.md, "Items". Plain data: the core draws it.
import type { IdMoves } from '../../../shared/id-moves'
import type { Art, ReplayGain } from '../../../shared/library'
import type { PluginId } from '../../../shared/plugins'
import type { ItemKey } from '../../../shared/plugins/items'
import type { QueueLink } from '../../../shared/saved-queue'
import type { SettingBlock } from '../../../shared/setting-blocks'
import type { EngineEvents } from '../audio/engine'
import type { IconName } from '../ui/icons'
import type { Sort } from '../library/views'
import type { Grouping, Heading } from '../library/groups'

// A cover and its colors, for a picture made from covers (an artist's round tile).
export type CoverArt = Pick<Art, 'cover' | 'palette'>

export type { ItemKind } from '../../../shared/plugins'

// A page of a plugin. Only that plugin reads `page`. `item`: the row to show
// on it (the song in its album).
export interface PageAddress {
  plugin: PluginId
  page: string
  item?: string
}

// Studio's chips or Classic's sidebar
export type NavKind = 'chips' | 'sidebar'

// A tab of a plugin: a chip in Studio, a section in Classic.
export interface Tab {
  // "albums", "radio"; unique across plugins
  id: string
  // the chip: "Albums"
  label: string
  // Classic's sidebar
  icon: IconName
  // the search box's placeholder: "Search stations"
  search: string
  // a shorter one for Classic's narrow sidebar, when it differs
  searchShort?: string
  // shown only there (Classic's Songs); none: in both
  only?: NavKind
  // Its search looks past one list (Albums' results, the stations): a search
  // that found nothing on another tab offers a button to search here, named
  // by `search` and the text: 'Search stations for "har"' (ticket 077).
  searchWide?: boolean
}

// A page is a list of blocks: the plugin gives the data, the core draws each
// kind of block one way (src/renderer/src/blocks). Spec "Pages and tabs".
// Lists hold the plugin's arrays as they are and make a tile or row only when
// it is drawn, so a 50k list costs what it costs to keep.
export type Block =
  | HeadBlock
  | TilesBlock
  | ListBlock
  | ShelvesBlock
  | AlbumSongsBlock
  | ColumnBlock
  | SongsBlock
  | RowsBlock
  | TreeBlock
  | EmptyBlock
  | TextBlock
  | ChipsBlock
  | ResultsBlock
  | ChangesBlock

// The column look of an artist's page (ticket 101): the head's back line
// across the page, the artist in a column on the left that stays in view,
// and `blocks` on the right. On a narrow page the column goes back on top.
export interface ColumnBlock {
  kind: 'column'
  head: HeadBlock
  blocks: Block[]
}

// A piece of a line: plain text, or a name that opens its page.
export interface Piece {
  text: string
  to?: PageAddress
}

// A button in a head: Play or Shuffle (the core plays the songs), a core menu
// for the songs, or one the plugin acts on. Play plays in order and is Pause
// while the queue plays these songs from this link; Shuffle plays shuffled.
export type HeadButton =
  | {
      play: 'all' | 'shuffle'
      label: string
      // asked when it is clicked
      songs: () => ItemKey[]
      from: string
      link?: QueueLink
      // the filled one
      primary?: boolean
      disabled?: boolean
    }
  | {
      // "Add to playlist" (the playlists) or "More" (the whole song menu)
      menu: 'playlist' | 'songs'
      // the label; More shows an icon and this as its tooltip
      label: string
      songs: () => ItemKey[]
      // the song menu's "From"
      from?: string
      link?: QueueLink
      // the plugin's own entries in that menu: act(head id, id)
      actions?: { id: string; label: string }[]
      disabled?: boolean
    }
  | {
      // act(head id, id)
      id: string
      label: string
      disabled?: boolean
    }

// The top of a page or list. `look` says what it heads: an album's page (a
// square picture), an artist's (a round one, the names editor), a folder's
// (no picture), or a list's title with its count.
export interface HeadBlock {
  kind: 'head'
  look: 'album' | 'artist' | 'folder' | 'list'
  // act's target for its buttons
  id: string
  title: string
  // the line over the title: "Album · 2003". A list's title row has none.
  meta?: string
  // a list's count, after its title: "8 albums" (it shows the number)
  count?: string
  // a list's choice of what it shows, at the right of its title row: "Album
  // artists | All artists". Picking one acts with (head id, id, the option's value).
  // `menu`: a button that opens a menu headed by `label`, for a choice of
  // many (the Albums sort): "Sort: Artist ▾", with `prefix` "Sort:".
  choice?: {
    id: string
    label: string
    value: string
    options: { value: string; label: string }[]
    menu?: { prefix: string }
  }
  // How the view is drawn (ticket 095): icon segments beside `choice` on a
  // list's title row, or at the right of an artist page's buttons. Picking
  // one acts with (head id, id, the look). Not a step in Back / Forward.
  looks?: {
    id: string
    label: string
    value: string
    options: { value: string; label: string; icon: IconName }[]
  }
  // a list's line under its title: "Reading musicforprogramming.net…"
  hint?: string
  // A line under the title that points at the search box: the core ends it
  // with where the box is ("above", "on the left"). In place of `hint`.
  searchHint?: string
  // the line under the title: "Marina Vale · 9 songs · 41 min"; a list's
  // line under its title: a link to a page of the list ("5 name fixes")
  line?: Piece[]
  // a web page, after the line; it opens in the browser (an https address)
  link?: { label: string; url: string }
  // the tooltip of the line over the title: where the album is on disk
  metaHint?: string
  // the big picture: a cover, or a round photo made from `covers` when there is none
  art?: { src: string | undefined; round?: boolean; covers?: CoverArt[] }
  // the link back over it: "All albums"
  back?: { label: string; to: PageAddress }
  // a small line, of names with a button each: "From tags: X (renamed) [Keep
  // separate]", or only text: "Song times are guessed". `hint` names the
  // button for screen readers when the label alone is the same on each.
  // `play`: a button that plays some of the page's songs in order, never
  // Pause, so only Play says it ("3 songs by Amber Fields [Play their songs]").
  note?: {
    text: string
    items: {
      text: string
      action?: { id: string; label: string; value: string; hint?: string }
      play?: { label: string; songs: () => ItemKey[]; from: string; link?: QueueLink }
    }[]
  }
  buttons?: HeadButton[]
  // Names to edit in place of the title (an artist's rename or split). Save
  // acts with the names as a JSON list, Cancel and Escape with "cancel".
  edit?: {
    names: string[]
    // each field's label, with its number
    label: string
    max: number
    // the button that adds a field, the one that takes one away
    add: string
    remove: string
    hint: string
    // names offered as each field is typed in (other artists, to join one)
    suggest?: string[]
    // whether Save is on for these names
    ok: (names: string[]) => boolean
  }
}

export interface Tile {
  title: string
  subtitle?: string
  // a square tile's cover and its colors
  art?: Art
  // a round tile's photo, else its picture from these covers
  photo?: string
  covers?: CoverArt[]
  to: PageAddress
  // whether the item playing is one of its songs (marked)
  playing?: (item: ItemKey) => boolean
  // its songs, asked for the play button and the song menu
  songs: () => ItemKey[]
  from: string
  link?: QueueLink
  // more entries in its song menu: act(the tile's key, id)
  actions?: { id: string; label: string }[]
}

// Albums, Artists. Only the rows on screen are drawn.
export interface TilesBlock<T = unknown> {
  kind: 'tiles'
  items: readonly T[]
  key(item: T): string
  tile(item: T): Tile
  // artists' round pictures
  round?: boolean
  // smaller tiles, so more fit in a row (the Artists grid)
  small?: boolean
  // heading rows over runs of tiles (ticket 096); the items are in the sort
  // the grouping follows
  groups?: TileGroups<T>
}

export interface TileGroups<T = unknown> {
  grouping: Grouping<T>
  // an album artist's heading, asked when drawn, with the items under it
  artist?: (heading: Heading, items: readonly T[]) => ArtistHeading
  // the A-Z strip on the right
  strip?: boolean
}

// The list look of Albums and Artists (ticket 097): a row per item, with
// columns on the right. Only the rows on screen are drawn. The same groups
// as a tiles block; without them, plain rows (an artist's albums).
export interface ListBlock<T = unknown> {
  kind: 'list'
  items: readonly T[]
  key(item: T): string
  row(item: T): ListRow
  // the title column's head, then a head and width in px for each of a
  // row's `cols`; for the eye only, they don't sort
  title: string
  cols: { head: string; width: number }[]
  // artists' round pictures
  round?: boolean
  groups?: TileGroups<T>
}

// A tile's data with its columns. `subtitle` is the line under the title,
// a link when `subTo` is set (the album artist's page).
export interface ListRow extends Tile {
  subTo?: PageAddress
  // the columns' text: "2003", "9", "41 min"
  cols: string[]
  // the first column as said under the title in a narrow list: "3 albums"
  under?: string
  // a few small covers after the name (an artist's newest albums)
  strip?: CoverArt[]
  // what a screen reader says for the row
  label: string
}

// The shelves look of Artists (ticket 098): each artist's heading over
// their albums in one line that scrolls sideways. Only the shelves on screen
// are drawn, and in each only the tiles near the view.
export interface ShelvesBlock<T = unknown> {
  kind: 'shelves'
  items: readonly T[]
  key(item: T): string
  title(item: T): string
  head(item: T): ArtistHeading
  // its albums as tiles, asked when the shelf is drawn
  shelf(item: T): Tile[]
  // the A-Z strip's letters, for the items in their order; none while searching
  letters?: Grouping<T>
}

// The albums look of an artist's page (ticket 100): each album's cover
// beside its head and its songs, in parts under small headings. The songs of
// every album are one list for the keys and for selecting. Only the rows near
// the view are drawn.
export interface AlbumSongsBlock {
  kind: 'albumSongs'
  parts: { title: string; albums: AlbumSongs[] }[]
  // "From" for songs taken from more than one album (a menu, a drag)
  from: string
  link?: QueueLink
}

// One album of it: its tile (title, cover, where it opens, its songs for
// Play, the menu and a drag), then its list as on the album page.
export interface AlbumSongs extends Tile {
  // the same as its tile's in the other looks, so a look switch keeps it
  key: string
  // "2019 · 12 songs · 48 min"
  meta: string
  items: ItemKey[]
  // each song's number (0: none), and "Disc 2" before a song
  numbers: number[]
  groups: { at: number; label: string }[]
  // the Artist column; off where every song has the album's artist
  artist: boolean
}

// An artist over their albums: picture, name, count, play; the name opens
// their page.
export interface ArtistHeading {
  sub: string
  photo?: string
  covers: CoverArt[]
  // none for a name with no page (a split credit)
  to?: PageAddress
  songs: () => ItemKey[]
  from: string
  link?: QueueLink
}

// A list of songs. With `sort` (null: in the order given) it is the sortable
// table, with only the rows on screen drawn; without, an album's numbered list.
export interface SongsBlock {
  kind: 'songs'
  // act's target for the sort
  id: string
  items: ItemKey[]
  // names the songs when they start the queue, and the title shown with `meta`
  from: string
  link?: QueueLink
  // the table's title: `meta` over `from`, or `from` alone on a list's
  // one-line title row when `meta` is ''; else `label`, a small heading
  meta?: string
  label?: string
  // the song count on the right; off where the head says it already
  count?: boolean
  // the Artist column; off where every song has the page's artist
  artist?: boolean
  // an album's list: the Album column in the Artist column's place (an
  // artist's top songs, from several albums)
  album?: boolean
  // an album's list: these songs at full strength, the rest dim (the
  // artist's own songs on an album opened under them)
  marked?: ItemKey[]
  // the sortable table's Plays and Last played columns (ticket 085)
  plays?: boolean
  // a column head was clicked: act(id, 'sort', its key). May be a getter, so
  // a sort click only sorts and doesn't build the page's list again.
  sort?: Sort | null
  // an album's list: each song's number (0: none), and "Disc 2" before a song
  numbers?: number[]
  groups?: { at: number; label: string }[]
  // An album's list: where each song starts in its file, shown in place of
  // its length (MFP's guessed times); `hint` is the column's tooltip.
  starts?: { at: number[]; hint: string }
  // What a click plays, from the song clicked: these in place of `items`
  // (all of an episode's songs, while the search shows a few). Must hold
  // every item.
  queue?: ItemKey[]
}

// What every row shows.
interface RowLook {
  title: string
  // under the title (a music folder's path), and its tooltip
  subtitle?: string
  art?: string
  // on the right: "12 songs"
  meta?: string
  // more on the right, a column each before `meta`: "2026", "22 songs"
  details?: string[]
}

// A row that opens a page; right-click gives the song menu for its songs.
export interface PageRow extends RowLook {
  to: PageAddress
  playing?: (item: ItemKey) => boolean
  songs: () => ItemKey[]
  from: string
  link?: QueueLink
}

// A row that plays its item (a station), marked while that item is the one
// playing. act(the row's key, id) for its star and its menu, which opens on
// a right click and from the row's "..." button.
export interface ItemRow extends RowLook {
  play: ItemKey
  // a star button after the row: `on` filled; `label` is its tooltip
  star?: { on: boolean; label: string }
  // its right-click menu: "Move up", "Remove"
  menu?: { id: string; label: string }[]
}

export type Row = PageRow | ItemRow

// Folders, MFP's episodes, stations. Only the rows on screen are drawn.
interface RowsOf<T> {
  kind: 'rows'
  items: readonly T[]
  key(item: T): string
  // the search text filters the list in place, and stays when a row opens,
  // so a match further down can be followed to
  filtered?: boolean
  // rows of an older answer while a newer one is on its way: drawn faded
  stale?: boolean
}

// The rows of a block are all of one sort, named by `rows`, so a block that
// mixes them does not type check (their heights differ).
export interface PageRowsBlock<T = unknown> extends RowsOf<T> {
  rows: 'page'
  row(item: T): PageRow
}

export interface ItemRowsBlock<T = unknown> extends RowsOf<T> {
  rows: 'item'
  row(item: T): ItemRow
  // The rows can be dragged to another place, or moved with Alt+Up and
  // Alt+Down: act(the row's key, 'move', the key of the row whose place it
  // takes). Keys, not places: the list may be filtered (My stations).
  reorder?: boolean
}

export type RowsBlock<T = unknown> = PageRowsBlock<T> | ItemRowsBlock<T>

// The path bar of a tree (Folders). A step along it keeps the search text.
export interface TreeBlock {
  kind: 'tree'
  // for screen readers: "Folder path"
  label: string
  path: { title: string; hint?: string; to: PageAddress; here?: boolean }[]
}

// Nothing to show. Alone on a page it fills it ("No music yet"); among other
// blocks it is a short note ("No matches"), or with no title one quiet line
// under a list ("No stations found."). Each way shows its button.
export interface EmptyBlock {
  kind: 'empty'
  // act's target for the button
  id: string
  title?: string
  text: string
  // act(id, the action's id)
  action?: { label: string; id: string }
  // It says the search text found nothing here: the core adds a button for
  // each other tab that searches wider ('Search your library for "har"').
  // Without it, those buttons go at the end of the page (ticket 077).
  nothingFound?: boolean
}

// Changes, each with the button that undoes it: "Beyonce → Beyoncé [Undo]".
// act(id, the action's id, its value).
export interface ChangesBlock {
  kind: 'changes'
  id: string
  // for screen readers: "Joined by AI"
  label: string
  rows: {
    key: string
    from: string
    to: Piece[]
    // `hint` names the button for screen readers: "Undo Beyonce to Beyoncé"
    action: { id: string; label: string; value: string; hint: string }
  }[]
}

// A small heading between blocks: "Albums" on an artist's page.
export interface TextBlock {
  kind: 'text'
  text: string
  // it starts a part of the page, with room above it (not right under the head)
  part?: boolean
}

// Words to search for, as a row of chips after a label: a click puts the
// word in the search box and searches at once (Radio's tags, ticket 082).
export interface ChipsBlock {
  kind: 'chips'
  // before the chips: "Search a tag"
  label: string
  words: string[]
}

// What a search found in one plugin: songs, or tiles (albums, artists). The
// core shows the first few of each group with "Show all" (spec "Pages and
// tabs", Search).
export type SearchGroup =
  { id: string; title: string; songs: ItemKey[] } | { id: string; title: string; tiles: TilesBlock }

// The search results of every plugin that is on, for the box's text: the
// page a plugin shows while it is searched (Albums). The plugin gives the
// "No matches" text; the core fills `groups` from each plugin's search().
export interface ResultsBlock {
  kind: 'results'
  empty: string
  groups?: FoundGroup[]
}

// A group with its plugin. `key` names it in Nav's searchAll after "Show all".
export interface FoundGroup {
  key: string
  plugin: PluginId
  group: SearchGroup
}

// A list block for a plugin's own array: its tiles and rows are typed by it.
export const tilesBlock = <T>(b: Omit<TilesBlock<T>, 'kind'>): TilesBlock =>
  ({ kind: 'tiles', ...b }) as TilesBlock
export const listBlock = <T>(b: Omit<ListBlock<T>, 'kind'>): ListBlock =>
  ({ kind: 'list', ...b }) as ListBlock
export const shelvesBlock = <T>(b: Omit<ShelvesBlock<T>, 'kind'>): ShelvesBlock =>
  ({ kind: 'shelves', ...b }) as ShelvesBlock
export const rowsBlock = <T>(
  b: Omit<PageRowsBlock<T>, 'kind'> | Omit<ItemRowsBlock<T>, 'kind'>
): RowsBlock => ({ kind: 'rows', ...b }) as RowsBlock

export interface ItemInfo {
  title: string
  // the artist; for a station, its codec or country
  subtitle?: string
  // the album; the episode
  group?: string
  // seconds; none for live
  length?: number
  art?: Art
  // Now Playing's links: the title, each name in the subtitle, the group
  titleTo?: PageAddress
  names?: { name: string; to?: PageAddress }[]
  groupTo?: PageAddress
  // the song menu's "Go to ..." items
  links?: { label: string; to: PageAddress }[]
  // the system's media controls' artist, when it is not the subtitle (a
  // station's name, also before its first song title)
  mediaArtist?: string
  // Why it can't play now, shown in place of the subtitle (a music folder
  // the last scan did not find: a drive not mounted). The queue holds it and
  // passes over it, as it does a song whose plugin is off.
  unavailable?: string
}

export type ItemState =
  | { state: 'ok'; info: ItemInfo }
  // the plugin knows it is gone (file deleted, episode removed)
  | { state: 'missing' }
  // the plugin's data isn't there yet
  | { state: 'loading' }

// What the core answers for an item: the plugin's state, or off while the
// plugin is off (it isn't asked then).
export type ItemAnswer = ItemState | { state: 'off'; text: string }

// Where a song lies in a bigger file (a CUE sheet's disc image). `file` is
// the same for every song of that file; no end: to the end of the file.
export interface PlayablePart {
  file: string
  start: number
  end?: number
}

// What the player bar may offer for an item. Next and Previous are hidden,
// not disabled, when false (decision 150).
export interface Can {
  seek: boolean
  pause: boolean
  next: boolean
  previous: boolean
}

// Something the bar offers besides play: the core draws it in its own style
// and tells the item's plugin when it is used (PageHalf.act).
export type Action =
  | {
      id: string
      kind: 'button'
      label: string
      // one of the core's icons; the stack shows it alone, with `hint` to read
      icon?: IconName
      // the tooltip: "Add to My stations"
      hint?: string
      // a button that stays pressed, as Shuffle does
      on?: boolean
      // at work: a click does nothing
      busy?: boolean
    }
  | {
      id: string
      kind: 'choice'
      // the menu's heading: "Stream"
      label: string
      // what the bar shows: "320k"
      short: string
      options: { id: string; label: string }[]
      // an option's id, or none
      picked: string
    }

export interface Playable {
  url: string
  part?: PlayablePart
  length: number | 'live'
  can: Can
  // a track item's; a live item's come through LiveHandle.actions, since they
  // change while it plays
  actions?: Action[]
  // the format, for the log when it won't play
  codec?: string
  // ReplayGain from its tags, to even out loudness (ticket 090)
  gain?: ReplayGain
  // the sample rate it decodes at, in Hz, for the audio graph (ticket 091);
  // none when not known (a stream)
  rate?: number
}

// A plugin's page half.
export interface PageHalf {
  // at once, from data the plugin holds: the queue draws thousands of rows
  info(id: string): ItemState
  // may wait (radio asks main first); undefined when it can't be played now
  play(id: string): Playable | undefined | Promise<Playable | undefined>
  // its tabs, in order (spec "Pages and tabs")
  tabs(): Tab[]
  // which of its tabs shows a page: where a link to it opens
  tabOf(page: string): string | undefined
  // whether a page is still there (a rescan may have removed it)
  canOpen(to: PageAddress): boolean
  // What is left of a page of one of its tabs after its data changed: the
  // page, one above it, or '' for the tab's top. None: pages never go.
  keep?(tab: string, page: string): string
  // The page's place under its tab, top first, for the scroll places: a
  // move up this path shows where the view was left (ticket 042).
  path?(tab: string, page: string): string[]
  // How the page is drawn, when its view has a choice of looks (ticket 095).
  // A new look keeps the first item on screen in view, not the old place.
  look?(tab: string, page: string): string | undefined
  // a page of one of its tabs, with the search box's text
  page(tab: string, page: string, query: string): Block[]
  // The search box's text while one of its tabs shows: when the tab opens,
  // on each change, and on Enter (`enter`). For a search on the network
  // (Radio Browser), which page() must not start: page() only reads.
  typed?(tab: string, query: string, enter: boolean): void
  // What it finds for the search box's text (trimmed, not empty), at once
  // and with no network, in the order shown. It always returns its groups,
  // even empty ones (one shown whole stays while the text changes); the core
  // hides the empty ones.
  search?(query: string): SearchGroup[]
  // What the core's Playlists page shows while this plugin has found no
  // songs at all: none once it has some. `noPlaylists`: Studio's list of
  // playlists with none in it, which says what playlists are for.
  emptyPlaylists?(noPlaylists: boolean): EmptyBlock | undefined
  // Its blocks in Settings, under its switch, asked while it is on.
  settings?(): SettingBlock[]
  // A settings block was used: a button (`press`), a row of a list (`remove`,
  // with the row's id), a switch (`set`, with 'true' or 'false'). `id` is the
  // block's. Apart from `act`, whose ids belong to the pages.
  actSetting?(id: string, actionId: string, value?: string): void
  // changes whenever an answer of `info` may have changed
  version(): number
  // A line the library shows next to the chips (at the foot of Classic's
  // sidebar) while it is busy: "Reading tags: 1,240 of 8,000". Not on its
  // tabs: the tab list would change with each line and rebuild the page.
  statusLine?(): string | undefined
  // The online cover lookup's lines under "Find missing covers online" in
  // Settings, with a spinner on the one that runs.
  coverLines?(): { text: string; busy: boolean }[]
  // Files from the system dropped on the window, asked while it is on.
  drop?(dropped: File[]): void
  // At start: asks main for its data, at once with the core's own asks (see
  // PluginStart). Never rejects: a failed ask leaves it with its defaults.
  start?(): Promise<PluginStart>
  // a plugin whose items are live (radio): it drives its own item
  live?: LivePlugin
  // One of the item's actions was used: a button (no value), or an option
  // picked. Also a block's button, tile or row: `id` is then the block's.
  act?(id: string, actionId: string, value?: string): void
  // A track item's can and actions now, read by the bar as they change (a
  // button turned on). Undefined: the Playable's. Live items use their handle.
  can?(id: string): Can | undefined
  actions?(id: string): Action[] | undefined
}

// A plugin's start, once its asks are answered. `load` runs once the settings
// are in, before the playlists and the queue: it gives the ids that moved
// (see id-moves.ts), renamed in them before they load. `listen` runs once the
// queue is back, for main's news after that; ids that move later go to
// `idsMoved`, which renames them in the queue and the playlists.
export interface PluginStart {
  load(): IdMoves | undefined
  listen?(idsMoved: (moves: IdMoves) => void): void
}

// A song heard on a live item, for the Queue part's list (newest last).
export interface HistoryEntry {
  title: string
  subtitle?: string
  // when it was heard
  at: number
  art?: Art
  // the newest entry is the title on air now (the core shows it while sound is wanted)
  now?: boolean
}

// How a live plugin tells the core about its item. Calls for an item that is
// no longer the live queue's are dropped.
export interface LiveHandle {
  // a new connection or stream: the core loads it and plays
  load(p: Playable): void
  // drops what the engine has now (a stalled connection), before a new one
  clear(): void
  // the plugin stopped by itself (it gave up, or the system paused it)
  stopped(): void
  history(list: HistoryEntry[]): void
  // undefined: stopped
  status(s: LiveStatus | undefined): void
  // what is on air: a new song title, a new cover
  info(info: ItemInfo): void
  // the item's actions now (a stream picked, the item saved)
  actions(list: Action[]): void
}

// The word next to the bar's dot, and its tooltip.
export interface LiveStatus {
  state: 'connecting' | 'live' | 'buffering' | 'reconnecting'
  // "Connecting to 320 kbps", "Retry 1 of 3"
  text: string
  // a wait that ends then (ms): the tooltip counts down to it
  until?: number
}

// A plugin whose items never end and can't be sought. Its reconnects and
// stream changes stay inside it; the core only plays what it loads.
export interface LivePlugin {
  // picked but not playing (after a restart): its info and history, no sound
  show(id: string, h: LiveHandle): void
  // undefined when it can't be played, or another play came meanwhile
  play(id: string, h: LiveHandle): Promise<Playable | undefined>
  // pause drops the connection; resume opens a new one
  pause(id: string): void
  resume(id: string): Promise<Playable | undefined>
  // the engine's events while its item plays
  events(id: string): Partial<EngineEvents>
  // media keys: the item after or before this one (radio: My stations)
  next(id: string): string | undefined
  previous(id: string): string | undefined
}
