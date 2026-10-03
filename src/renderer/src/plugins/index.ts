// The core's way to plugins: what an item is, how to play it, which page a
// link opens. The page halves by plugin id; a plugin that is off is not asked.
import { plugins, type PluginId } from '../../../shared/plugins'
import type { ItemKey } from '../../../shared/plugins/items'
import { pluginOn } from '../stores/settings.svelte'
import { filesHalf } from './files'
import { mfpHalf } from './mfp'
import type { ItemAnswer, ItemInfo, PageAddress, PageHalf, Playable } from './types'

// radio gets its half with the live queue (ticket 057)
const halves: Partial<Record<PluginId, PageHalf>> = { files: filesHalf, mfp: mfpHalf }

const missing: ItemAnswer = { state: 'missing' }
const loading: ItemAnswer = { state: 'loading' }

// Each plugin with the start of its keys and its answer while off, made once,
// so asking makes no objects.
const entries = plugins.map((p) => ({
  id: p.id,
  prefix: `${p.id}:`,
  half: halves[p.id],
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
  // radio's keys wait for its half (ticket 057): never pruned as gone
  return e.half ? e.half.info(key.slice(e.prefix.length)) : loading
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
  return e.half?.play(key.slice(e.prefix.length))
}

export function canOpen(to: PageAddress): boolean {
  return pluginOn(to.plugin) && !!halves[to.plugin]?.canOpen(to)
}

export function openPage(to: PageAddress): void {
  if (canOpen(to)) halves[to.plugin]!.open(to)
}

// Changes whenever an answer of itemInfo may have changed: a plugin turned on
// or off, or new data in one.
export function itemsVersion(): string {
  return plugins.map((p) => (pluginOn(p.id) ? (halves[p.id]?.version() ?? 0) : 'off')).join(',')
}
