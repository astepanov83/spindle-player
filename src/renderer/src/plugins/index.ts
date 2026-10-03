// The core's way to plugins: what an item is, how to play it, which page a
// link opens. The page halves by plugin id; a plugin that is off is not asked.
import { plugins, type PluginId } from '../../../shared/plugins'
import type { ItemKey } from '../../../shared/plugins/items'
import { pluginOn } from '../stores/settings.svelte'
import { filesHalf } from './files'
import { mfpHalf } from './mfp'
import { radioHalf } from './radio'
import type { ItemAnswer, ItemInfo, LivePlugin, PageAddress, PageHalf, Playable } from './types'

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

export function canOpen(to: PageAddress): boolean {
  return pluginOn(to.plugin) && halves[to.plugin].canOpen(to)
}

export function openPage(to: PageAddress): void {
  if (canOpen(to)) halves[to.plugin].open(to)
}

// Changes whenever an answer of itemInfo may have changed: a plugin turned on
// or off, or new data in one.
export function itemsVersion(): string {
  return plugins.map((p) => (pluginOn(p.id) ? halves[p.id].version() : 'off')).join(',')
}
