// What the core asks a plugin's page half about its items. See
// work/specs/plugins.md, "Items". Plain data: the core draws it.
import type { Art } from '../../../shared/library'
import type { PluginId } from '../../../shared/plugins'
import type { EngineEvents } from '../audio/engine'
import type { IconName } from '../ui/icons'

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
  // changes whenever an answer of `info` may have changed
  version(): number
  // a plugin whose items are live (radio): it drives its own item
  live?: LivePlugin
  // one of the item's actions was used: a button (no value), or an option picked
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
