// The core's way to plugins: what an item is, how to play it, which page a
// link opens. The page halves by plugin id; a plugin that is off is not asked.
import { plugins, type PluginId } from '../../../shared/plugins'
import type { IdMoves } from '../../../shared/id-moves'
import { itemKey, type ItemKey } from '../../../shared/plugins/items'
import type { SettingBlock } from '../../../shared/setting-blocks'
import { library, playlistsTab, statsTab, type NavTab } from '../stores/library.svelte'
import { pluginOn } from '../stores/settings.svelte'
import { filesHalf } from './files'
import { mfpHalf } from './mfp'
import { radioHalf } from './radio'
import { orderTabs, tabsIn, widerSearches, type ShownTab } from './tabs'
import type {
  Action,
  Block,
  Can,
  EmptyBlock,
  FoundGroup,
  ItemAnswer,
  ItemInfo,
  LivePlugin,
  NavKind,
  PageAddress,
  PageHalf,
  OpenSongs,
  Playable,
  SongInfoView,
  Tile
} from './types'

const halves: Record<PluginId, PageHalf> = { files: filesHalf, radio: radioHalf, mfp: mfpHalf }

const missing: ItemAnswer = { state: 'missing' }

// Each plugin with the start of its keys and its answer while off, made once,
// so asking makes no objects.
const entries = plugins.map((p) => ({
  id: p.id,
  prefix: `${p.id}:`,
  half: halves[p.id],
  kind: p.itemKind,
  off: { state: 'off', text: p.offText } as ItemAnswer
}))

// Keys in the stores were checked when they came in, so this only matches
// their start: it runs for every row of a 50k queue.
function entryOf(key: string): (typeof entries)[number] | undefined {
  for (const e of entries) if (key.startsWith(e.prefix)) return e
  return undefined
}

export function itemInfo(key: ItemKey): ItemAnswer {
  const e = entryOf(key)
  if (!e) return missing
  if (!pluginOn(e.id)) return e.off
  return e.half.info(key.slice(e.prefix.length))
}

// The item's info while it can be drawn as itself.
export function infoOf(key: ItemKey | undefined): ItemInfo | undefined {
  if (!key) return undefined
  const s = itemInfo(key)
  return s.state === 'ok' ? s.info : undefined
}

// Undefined while the item can't be played (off, missing, loading).
export function playItem(key: ItemKey): Playable | undefined | Promise<Playable | undefined> {
  const e = entryOf(key)
  if (!e || !pluginOn(e.id)) return undefined
  return e.half.play(key.slice(e.prefix.length))
}

// The live plugin of a live item and the id it knows, on or off: an item
// playing when its plugin goes off still has to be stopped.
export function liveOf(key: ItemKey): { plugin: LivePlugin; id: string } | undefined {
  const e = entryOf(key)
  const plugin = e?.half.live
  return plugin && { plugin, id: key.slice(e.prefix.length) }
}

// Which queue plays the item: its plugin's kind of item.
export function isLive(key: ItemKey): boolean {
  return entryOf(key)?.kind === 'live'
}

// One of the player bar's actions was used on the item. Not while its plugin is off.
export function actOn(key: ItemKey, actionId: string, value?: string): void {
  const e = entryOf(key)
  if (e && pluginOn(e.id)) e.half.act?.(key.slice(e.prefix.length), actionId, value)
}

// What a track item can do and offers now, when its plugin says more than
// its Playable did. Undefined while the plugin is off or says nothing.
export function canOf(key: ItemKey): Can | undefined {
  const e = entryOf(key)
  return e && pluginOn(e.id) ? e.half.can?.(key.slice(e.prefix.length)) : undefined
}

export function actionsOf(key: ItemKey): Action[] | undefined {
  const e = entryOf(key)
  return e && pluginOn(e.id) ? e.half.actions?.(key.slice(e.prefix.length)) : undefined
}

// The song info panel's view of an item (ticket 127), while its plugin is on
// and gives one.
export function songInfoOf(
  key: ItemKey
): { now: SongInfoView; full: Promise<SongInfoView> } | undefined {
  const e = entryOf(key)
  return e && pluginOn(e.id) ? e.half.songInfo?.(key.slice(e.prefix.length)) : undefined
}

// Whether "Song info" is offered for an item, without reading anything.
export function hasSongInfo(key: ItemKey): boolean {
  const e = entryOf(key)
  return (
    !!e &&
    pluginOn(e.id) &&
    !!e.half.songInfo &&
    e.half.info(key.slice(e.prefix.length)).state === 'ok'
  )
}

export function canOpen(to: PageAddress): boolean {
  return pluginOn(to.plugin) && halves[to.plugin].canOpen(to)
}

// A link: the page in the tab of its plugin that shows it, at its item.
export function openPage(to: PageAddress): void {
  const tab = canOpen(to) ? halves[to.plugin].tabOf(to.page) : undefined
  if (tab) library.link(tab, to.page, to.item ?? null)
}

// A tab's open page as blocks, from its plugin. The core's Playlists and
// Stats have none: they draw their own. A page of search results gets every plugin's groups.
export function pageBlocks(tab: ShownTab): Block[] {
  if (tab.plugin === 'core') return []
  const blocks = halves[tab.plugin].page(tab.id, library.page(tab.id), library.query)
  return blocks.map((b) =>
    b.kind === 'results' ? { ...b, groups: searchGroups(library.query) } : b
  )
}

// The search box's text, to the plugin of the tab shown: as it changes, and
// on Enter. Not while its plugin is off. Enter on Stats, which has nothing
// to search, searches the library.
export function typedIn(
  plugin: PluginId | 'core',
  tab: string,
  query: string,
  enter = false
): void {
  if (plugin === 'core') {
    if (enter && tab === statsTab && query.trim()) searchFor(query, tab)
  } else if (pluginOn(plugin)) halves[plugin].typed?.(tab, query, enter)
}

// What the plugins that are on find for the search text, in plugin order.
// Empty groups too: one shown whole stays while the text changes.
export function searchGroups(query: string): FoundGroup[] {
  const q = query.trim()
  if (!q) return []
  return plugins.flatMap((p) => {
    const search = pluginOn(p.id) ? halves[p.id].search : undefined
    return search
      ? search(q).map((group) => ({ key: `${p.id}:${group.id}`, plugin: p.id, group }))
      : []
  })
}

// A block's button, tile or row was used. Not while its plugin is off.
export function actOnPage(
  plugin: PluginId,
  target: string,
  actionId: string,
  value?: string
): void {
  if (pluginOn(plugin)) halves[plugin].act?.(target, actionId, value)
}

// The busy lines of the plugins that are on (a scan), in plugin order.
export function statusLines(): string[] {
  return plugins.flatMap((p) => {
    const line = pluginOn(p.id) ? halves[p.id].statusLine?.() : undefined
    return line ? [line] : []
  })
}

// The cover lookup's lines of the plugins that are on, for Settings.
export function coverLines(): { text: string; busy: boolean }[] {
  return plugins.flatMap((p) => (pluginOn(p.id) ? (halves[p.id].coverLines?.() ?? []) : []))
}

// Each plugin's start, asked for at once, on or off: a plugin turned on later
// has its data. Once all have answered, `load` loads them in list order and
// gives the ids each one moved, and `listen` lets them hear main's news.
export async function startPlugins(): Promise<{
  load(): { plugin: PluginId; moves: IdMoves }[]
  listen(
    idsMoved: (plugin: PluginId, moves: IdMoves) => void,
    open: (keys: ItemKey[], how: Parameters<OpenSongs>[1]) => void
  ): void
}> {
  const started = await Promise.all(
    entries.map(async (e) => ({ id: e.id, start: await e.half.start?.() }))
  )
  return {
    load: () =>
      started.flatMap(({ id, start }) => {
        const moves = start?.load()
        return moves ? [{ plugin: id, moves }] : []
      }),
    listen: (idsMoved, open) => {
      for (const { id, start } of started)
        start?.listen?.(
          (moves) => idsMoved(id, moves),
          (ids, how) =>
            open(
              ids.map((i) => itemKey(id, i)),
              how
            )
        )
    }
  }
}

// Whether a plugin that is on takes files dropped on the window.
export function takesDrops(): boolean {
  return plugins.some((p) => pluginOn(p.id) && !!halves[p.id].drop)
}

// Files dropped on the window, to each plugin that is on and takes them.
// None on: the drop does nothing (the cursor said so while dragging).
export function dropOn(dropped: File[]): void {
  for (const p of plugins) if (pluginOn(p.id)) halves[p.id].drop?.(dropped)
}

// The settings blocks of a plugin that is on.
export function settingBlocks(plugin: PluginId): SettingBlock[] {
  return pluginOn(plugin) ? (halves[plugin].settings?.() ?? []) : []
}

// A settings block's button, row or switch was used. Not while its plugin is off.
export function actOnSetting(
  plugin: PluginId,
  target: string,
  actionId: string,
  value?: string
): void {
  if (pluginOn(plugin)) halves[plugin].actSetting?.(target, actionId, value)
}

// A tile, row or back link on a page of `tab`. A page of that tab opens in
// it, as a step; one that another tab shows is a link there. `keepQuery`: a
// step along a list the search filters in place (Folders).
export function openFrom(tab: string, to: PageAddress, keepQuery = false): void {
  const other = halves[to.plugin].tabOf(to.page)
  if (other && other !== tab) openPage(to)
  else library.openPage(tab, to.page, keepQuery)
}

// What the core's Playlists page shows while a plugin that is on has found no
// songs yet ("No music yet"), with the plugin to act on its button.
export function playlistsEmpty(
  noPlaylists: boolean
): { plugin: PluginId; block: EmptyBlock } | undefined {
  for (const p of plugins) {
    const block = pluginOn(p.id) ? halves[p.id].emptyPlaylists?.(noPlaylists) : undefined
    if (block) return { plugin: p.id, block }
  }
  return undefined
}

// The core's tab. Classic lists each playlist in its sidebar instead.
function playlists(): ShownTab {
  const open = library.openPlaylist
  return {
    id: playlistsTab,
    label: 'Playlists',
    icon: 'list',
    search: open
      ? 'Search this playlist'
      : library.openSmart
        ? 'Search this list'
        : 'Search playlists',
    // a playlist's songs take fields; the list of playlists only names
    fields: !!(open || library.openSmart),
    plugin: 'core'
  }
}

// The core's listening stats (ticket 116): a chip after Playlists, a
// section in Classic.
const stats: ShownTab = {
  id: statsTab,
  label: 'Stats',
  icon: 'chart',
  search: 'Search your library',
  searchShort: 'Search library',
  plugin: 'core'
}

// The tabs of the plugins that are on, in order (tabs.ts).
export function pluginTabs(): ShownTab[] {
  const on = plugins.filter((p) => pluginOn(p.id))
  return orderTabs(
    on.map((p) => halves[p.id].tabs().map((t) => ({ ...t, plugin: p.id }))),
    [playlists(), stats]
  )
}

// The tabs of this library that a search on `tab` that found little can go
// to, with the search text (ticket 077).
export function widerTabs(tab: string, nav: NavKind): ShownTab[] {
  return widerSearches(tabsIn(pluginTabs(), nav), tab, library.query)
}

// The text searched in that tab; Radio Browser is asked at once, as on Enter.
export function searchWider(tab: string): void {
  library.searchIn(tab)
  const t = pluginTabs().find((t) => t.id === tab)
  if (t) typedIn(t.plugin, t.id, library.query, true)
}

// What the library store needs of them, to close what left (setTabs).
export function navTabs(): NavTab[] {
  return pluginTabs().map((t) => {
    const keep = t.plugin === 'core' ? undefined : halves[t.plugin].keep
    return {
      id: t.id,
      plugin: t.plugin,
      ...(t.only ? { only: t.only } : {}),
      ...(keep ? { keep } : {})
    }
  })
}

// The open page's place under its tab, for the scroll places (ticket 042).
export function pagePath(tab: string): string[] {
  const t = pluginTabs().find((t) => t.id === tab)
  // one page, nothing under it
  if (tab === statsTab) return []
  const page = library.page(tab)
  if (!t) return []
  if (t.plugin === 'core') {
    if (library.openPlaylist) return [`pl:${library.openPlaylist}`]
    return library.openSmart ? [`smart:${library.openSmart}`] : []
  }
  const path = halves[t.plugin].path
  const out = path ? path(tab, page) : page ? [page] : []
  // one group of the search results shown whole is a view below them
  return library.searchAll && library.query.trim() ? [...out, `all:${library.searchAll}`] : out
}

// How the open page of a tab is drawn, when its view has a choice of looks.
export function pageLook(tab: string): string | undefined {
  const t = pluginTabs().find((t) => t.id === tab)
  if (!t || t.plugin === 'core') return undefined
  return halves[t.plugin].look?.(tab, library.page(tab))
}

// Changes whenever an answer of itemInfo may have changed: a plugin turned on
// or off, or new data in one.
export function itemsVersion(): string {
  return plugins.map((p) => (pluginOn(p.id) ? halves[p.id].version() : 'off')).join(',')
}

// The tile of an album or artist page (its picture, its songs), for the
// stats page's top lists. None while its plugin is off or the page is gone.
export function tileAt(to: PageAddress): Tile | undefined {
  return canOpen(to) ? halves[to.plugin].tileOf?.(to.page) : undefined
}

// A song in a plugin that is on, by the artist and title a radio station
// gave (ticket 119): the first plugin that has it.
export function findSong(artist: string, title: string): ItemKey | undefined {
  for (const p of plugins) {
    const find = pluginOn(p.id) ? halves[p.id].findSong : undefined
    const id = find?.(artist, title)
    if (id !== undefined) return itemKey(p.id, id)
  }
  return undefined
}

// Every song of the plugins that are on and give them (files), as item
// keys in plugin and library order, with when each came in (ticket 118).
// None: no plugin that is on has songs to give, so there are no such lists.
export function librarySongs(): { key: ItemKey; added: number }[] | undefined {
  let out: { key: ItemKey; added: number }[] | undefined
  for (const p of plugins) {
    const songs = pluginOn(p.id) ? halves[p.id].songs : undefined
    if (!songs) continue
    out ??= []
    for (const s of songs()) out.push({ key: itemKey(p.id, s.id), added: s.added })
  }
  return out
}

// The search box gets `text` and the tab that searches wide shows its
// results (Albums', "Search your library"), as a step. False when no other
// plugin that is on searches wide.
export function searchFor(text: string, from: string): boolean {
  const t = pluginTabs().find((x) => x.searchWide && x.id !== from)
  if (!t) return false
  library.searchIn(t.id)
  library.query = text
  typedIn(t.plugin, t.id, text, true)
  return true
}
