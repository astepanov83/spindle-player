// What the core asks a plugin's page half about its items. See
// work/specs/plugins.md, "Items". Plain data: the core draws it.
import type { Art } from '../../../shared/library'
import type { PluginId } from '../../../shared/plugins'
import type { ItemKey } from '../../../shared/plugins/items'
import type { QueueLink } from '../../../shared/saved-queue'
import type { EngineEvents } from '../audio/engine'
import type { IconName } from '../ui/icons'
import type { Sort } from '../library/views'

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
  // the line next to the chips: "Scanning 1,240 of 8,000"
  status?: string
  // shown only there (Classic's Songs); none: in both
  only?: NavKind
}

// A page is a list of blocks: the plugin gives the data, the core draws each
// kind of block one way (src/renderer/src/blocks). Spec "Pages and tabs".
// Lists hold the plugin's arrays as they are and make a tile or row only when
// it is drawn, so a 50k list costs what it costs to keep.
export type Block =
  | HeadBlock
  | TilesBlock
  | SongsBlock
  | RowsBlock
  | TreeBlock
  | EmptyBlock
  | TextBlock
  | ResultsBlock
  | ViewBlock

// A piece of a line: plain text, or a name that opens its page.
export interface Piece {
  text: string
  to?: PageAddress
}

// A button in a head: Play or Shuffle (the core plays the songs), a core menu
// for the songs, or one the plugin acts on.
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
      // Pause while the queue plays these songs from this link (an album's)
      pauses?: boolean
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
  // the line over the title: "Library", "Album · 2003"
  meta?: string
  // a list's count, on the right: "8 albums"
  count?: string
  // a list's line under its title: "Reading musicforprogramming.net…"
  hint?: string
  // the line under the title: "Marina Vale · 9 songs · 41 min"
  line?: Piece[]
  // a web page, after the line; it opens in the browser (an https address)
  link?: { label: string; url: string }
  // where it is, under that, cut at its start: "/music/Rock/Album"
  where?: Piece
  // the big picture: a cover, or a round photo made from `covers` when there is none
  art?: { src: string | undefined; round?: boolean; covers?: Pick<Art, 'cover' | 'palette'>[] }
  // the link back over it: "All albums"
  back?: { label: string; to: PageAddress }
  // a small line, of names with a button each: "From tags: X (renamed) [Use
  // tag]", or only text: "Song times are guessed"
  note?: {
    text: string
    items: { text: string; action?: { id: string; label: string; value: string } }[]
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
  covers?: Pick<Art, 'cover' | 'palette'>[]
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
  // the table's title: `meta` over `from`; else `label`, a small heading
  meta?: string
  label?: string
  // the song count on the right; off where the head says it already
  count?: boolean
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

export interface Row {
  title: string
  // under the title (a music folder's path), and its tooltip
  subtitle?: string
  art?: string
  // on the right: "12 songs"
  meta?: string
  // more on the right, a column each before `meta`: "2026", "22 songs"
  details?: string[]
  to: PageAddress
  playing?: (item: ItemKey) => boolean
  songs: () => ItemKey[]
  from: string
  link?: QueueLink
}

// Folders. Only the rows on screen are drawn.
export interface RowsBlock<T = unknown> {
  kind: 'rows'
  items: readonly T[]
  key(item: T): string
  row(item: T): Row
  // the search text filters the list in place, and stays when a row opens,
  // so a match further down can be followed to
  filtered?: boolean
}

// The path bar of a tree (Folders). A step along it keeps the search text.
export interface TreeBlock {
  kind: 'tree'
  // for screen readers: "Folder path"
  label: string
  path: { title: string; hint?: string; to: PageAddress; here?: boolean }[]
}

// Nothing to show. Alone on a page it fills it ("No music yet"), with its
// button; among other blocks it is a short note ("No matches").
export interface EmptyBlock {
  kind: 'empty'
  // act's target for the button
  id: string
  title: string
  text: string
  action?: { label: string; id: string }
}

// A small heading between blocks: "Albums" on an artist's page.
export interface TextBlock {
  kind: 'text'
  text: string
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

// Temporary: a plugin's old view, which the core draws as it is until blocks
// draw it. Radio's goes in ticket 062, MFP's in 061; then this kind goes.
export interface ViewBlock {
  kind: 'view'
  view: 'radio' | 'mfp'
}

// What a plugin shows in Settings: data again, drawn by the core
// (components/SettingBlocks.svelte). Spec "Settings".
export type SettingBlock =
  // a small heading over the blocks of a section
  | { kind: 'title'; text: string }
  // a line of text; `busy`: with a spinner
  | { kind: 'status'; text: string; busy?: boolean }
  // `remove` is the button's label on each row; `confirm`, when there, asks
  // first with that label. `paths`: the titles are paths, cut in the middle.
  // act: `remove` with the row's id.
  | {
      kind: 'list'
      id: string
      rows: { id: string; title: string; note?: string }[]
      remove?: string
      confirm?: string
      paths?: boolean
      disabled?: boolean
    }
  // buttons side by side when they follow each other. act: `press`
  | { kind: 'button'; id: string; label: string; disabled?: boolean }
  // act: `set` with 'true' or 'false'
  | { kind: 'switch'; id: string; label: string; on: boolean }

// A list block for a plugin's own array: its tiles and rows are typed by it.
export const tilesBlock = <T>(b: Omit<TilesBlock<T>, 'kind'>): TilesBlock =>
  ({ kind: 'tiles', ...b }) as TilesBlock
export const rowsBlock = <T>(b: Omit<RowsBlock<T>, 'kind'>): RowsBlock =>
  ({ kind: 'rows', ...b }) as RowsBlock

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
      // what the bar shows: "320"
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
  // a page of one of its tabs, with the search box's text
  page(tab: string, page: string, query: string): Block[]
  // What it finds for the search box's text (trimmed, not empty), at once
  // and with no network, in the order shown. It always returns its groups,
  // even empty ones (one shown whole stays while the text changes); the core
  // hides the empty ones.
  search?(query: string): SearchGroup[]
  // What the core's Playlists page shows while this plugin has found no
  // songs at all: none once it has some. `noPlaylists`: Studio's list of
  // playlists with none in it, which says what playlists are for.
  emptyPlaylists?(noPlaylists: boolean): EmptyBlock | undefined
  // Its blocks in Settings, asked while it is on: under its switch, or in a
  // section of their own while it has none (files, until ticket 063).
  settings?(): SettingBlock[]
  // A settings block was used: a button (`press`), a row of a list (`remove`,
  // with the row's id), a switch (`set`, with 'true' or 'false'). `id` is the
  // block's. Apart from `act`, whose ids belong to the pages.
  actSetting?(id: string, actionId: string, value?: string): void
  // changes whenever an answer of `info` may have changed
  version(): number
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
