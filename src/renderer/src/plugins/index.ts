// The core's way to plugins: what an item is, how to play it, which page a
// link opens. The page halves by plugin id; a plugin that is off is not asked.
import { plugins, type PluginId } from '../../../shared/plugins'
import type { ItemKey } from '../../../shared/plugins/items'
import { library, playlistsTab, type NavTab } from '../stores/library.svelte'
import { pluginOn } from '../stores/settings.svelte'
import { filesHalf } from './files'
import { mfpHalf } from './mfp'
import { radioHalf } from './radio'
import { orderTabs, type ShownTab } from './tabs'
import type {
  Action,
  Can,
  ItemAnswer,
  ItemInfo,
  LivePlugin,
  PageAddress,
  PageHalf,
  Playable
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

export function canOpen(to: PageAddress): boolean {
  return pluginOn(to.plugin) && halves[to.plugin].canOpen(to)
}

// A link: the page in the tab of its plugin that shows it, at its item.
export function openPage(to: PageAddress): void {
  const tab = canOpen(to) ? halves[to.plugin].tabOf(to.page) : undefined
  if (tab) library.link(tab, to.page, to.item ?? null)
}

// The core's tab. Classic lists each playlist in its sidebar instead.
function playlists(): ShownTab {
  const open = library.openPlaylist
  return {
    id: playlistsTab,
    label: 'Playlists',
    icon: 'list',
    search: open ? 'Search this playlist' : 'Search playlists',
    plugin: 'core'
  }
}

// The tabs of the plugins that are on, in order (tabs.ts).
export function pluginTabs(): ShownTab[] {
  const on = plugins.filter((p) => pluginOn(p.id))
  return orderTabs(
    on.map((p) => halves[p.id].tabs().map((t) => ({ ...t, plugin: p.id }))),
    playlists()
  )
}

// What the library store needs of them, to close what left (setTabs).
export function navTabs(): NavTab[] {
  return pluginTabs().map((t) => {
    const keep = t.plugin === 'core' ? undefined : halves[t.plugin].keep
    return { id: t.id, ...(t.only ? { only: t.only } : {}), ...(keep ? { keep } : {}) }
  })
}

// The open page's place under its tab, for the scroll places (ticket 042).
export function pagePath(tab: string): string[] {
  const t = pluginTabs().find((t) => t.id === tab)
  const page = library.page(tab)
  if (!t) return []
  if (t.plugin === 'core') return library.openPlaylist ? [`pl:${library.openPlaylist}`] : []
  const path = halves[t.plugin].path
  return path ? path(tab, page) : page ? [page] : []
}

// Changes whenever an answer of itemInfo may have changed: a plugin turned on
// or off, or new data in one.
export function itemsVersion(): string {
  return plugins.map((p) => (pluginOn(p.id) ? halves[p.id].version() : 'off')).join(',')
}
