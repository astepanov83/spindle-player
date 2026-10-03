// An item is a plugin id plus an id only that plugin understands, kept as one
// string so a 50k queue stays small: "files:3fa1c2...", "mfp:9b0e...", "radio:rb-1234".
import { isPluginId, plugins, type ItemKind, type PluginId } from '../plugins'

export type ItemKey = `${PluginId}:${string}`

export function itemKey(plugin: PluginId, id: string): ItemKey {
  return `${plugin}:${id}`
}

// Splits at the first ":", so the id may hold more of them.
export function splitKey(key: string): { plugin: PluginId; id: string } | undefined {
  const at = key.indexOf(':')
  if (at < 0) return undefined
  const plugin = key.slice(0, at)
  const id = key.slice(at + 1)
  if (!isPluginId(plugin) || !id) return undefined
  return { plugin, id }
}

export function isItemKey(v: unknown): v is ItemKey {
  return typeof v === 'string' && v.length <= 5000 && splitKey(v) !== undefined
}

// A key of a plugin whose items are of this kind: a track queue and a playlist
// hold only `track` items.
export function isKeyOfKind(v: unknown, kind: ItemKind): v is ItemKey {
  if (!isItemKey(v)) return false
  const plugin = splitKey(v)!.plugin
  return plugins.some((p) => p.id === plugin && p.itemKind === kind)
}
