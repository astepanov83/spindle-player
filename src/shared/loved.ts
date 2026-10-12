// Songs the user loved (ticket 117), kept in loved.json in userData by item
// key with the time each was loved, so a rescan keeps them. Never written into
// the music files. The page changes its copy and tells main, which saves it.
import { plugins, type PluginId } from './plugins'
import { itemKey, splitKey, type ItemKey } from './plugins/items'
import type { IdMoves } from './id-moves'

// when each song was loved, ms since 1970
export type Loved = Readonly<Record<ItemKey, number>>

export interface LovedFile {
  version: 1
  loved: Loved
}

// Only plugins that say so (files): a station is not a song, and MFP's songs
// are guessed times inside a mix.
const lovable = new Set<string>(plugins.filter((p) => p.canLove).map((p) => p.id))

export function canLove(key: unknown): key is ItemKey {
  if (typeof key !== 'string' || key.length > 5000) return false
  const k = splitKey(key)
  return !!k && lovable.has(k.plugin)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

// A bad entry is dropped on its own; anything else gives no hearts.
export function parseLoved(raw: unknown): Record<ItemKey, number> {
  const out: Record<ItemKey, number> = {}
  if (!isObject(raw) || !isObject(raw.loved)) return out
  for (const [key, at] of Object.entries(raw.loved))
    if (isTime(at) && canLove(key)) out[key] = Math.round(at)
  return out
}

// Version 1 with a loved object. Anything else is copied aside before the first save.
export function isKnownLovedFile(raw: unknown): boolean {
  return isObject(raw) && raw.version === 1 && isObject(raw.loved)
}

export function lovedFile(loved: Loved): LovedFile {
  return { version: 1, loved }
}

// Loves or unloves the songs that can be. A song loved again keeps its first
// time. A new object when something changed, so the page sees it; else the same.
export function setLoved(loved: Loved, keys: readonly ItemKey[], on: boolean, now: number): Loved {
  let out: Record<ItemKey, number> | undefined
  for (const key of keys) {
    if (!canLove(key) || Object.hasOwn(out ?? loved, key) === on) continue
    out ??= { ...loved }
    if (on) out[key] = now
    else delete out[key]
  }
  return out ?? loved
}

// The keys of a set message from the page, or undefined for a bad one.
// Keys of plugins that can't love are left to setLoved.
export function parseLoveKeys(raw: unknown): ItemKey[] | undefined {
  if (!Array.isArray(raw) || raw.length > 1_000_000) return undefined
  return raw.every((k) => typeof k === 'string') ? (raw as ItemKey[]) : undefined
}

// Songs whose ids changed (see id-moves.ts). When both the old and the new id
// are loved, the earlier time stays: it was loved since then. The same object
// when nothing moved.
export function moveLoved(loved: Loved, plugin: PluginId, moves: IdMoves): Loved {
  let out: Record<ItemKey, number> | undefined
  for (const key of Object.keys(loved) as ItemKey[]) {
    const k = splitKey(key)
    if (k?.plugin !== plugin || !Object.hasOwn(moves, k.id)) continue
    out ??= { ...loved }
    // what is under the key now: another move may have put it there
    const at = out[key]
    if (at === undefined) continue
    delete out[key]
    const to = itemKey(plugin, moves[k.id])
    const there = out[to]
    out[to] = there === undefined ? at : Math.min(there, at)
  }
  return out ?? loved
}
