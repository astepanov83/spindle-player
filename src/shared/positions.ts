// Where long songs were left (ticket 114): an hour-long disc image track, a
// DJ mix or an audiobook chapter starts there again after something else
// played. Kept in positions.json in userData by item key, so a rescan keeps
// them. The page says where a song is while it plays; main saves it.
import { plugins, type PluginId } from './plugins'
import { itemKey, splitKey, type ItemKey } from './plugins/items'
import type { IdMoves } from './id-moves'

export interface Position {
  // seconds into the song
  pos: number
  // when it was last kept, ms since 1970
  last: number
}

export type Positions = Readonly<Record<ItemKey, Position>>

export interface PositionsFile {
  version: 1
  at: Positions
}

// Songs this long or longer keep their place; shorter ones start at 0.
export const longSec = 20 * 60
// Played this close to the end, a song counts as heard: it starts at 0 again.
export const endSec = 30
// A song starts this much before its place, so the listener gets back in.
export const stepBackSec = 5
// Only the songs used last are kept.
export const positionsMax = 500

// Only plugins that say so (files): MFP's songs are guessed parts of one
// episode, and a station has no place.
const keeping = new Set<string>(plugins.filter((p) => p.keepsPlace).map((p) => p.id))

export function keepsPlace(key: unknown): key is ItemKey {
  if (typeof key !== 'string' || key.length > 5000) return false
  const k = splitKey(key)
  return !!k && keeping.has(k.plugin)
}

export const isLong = (length: number | undefined): boolean =>
  typeof length === 'number' && length >= longSec

// What to keep of a song left at `pos`: the place, or null when there is
// nothing to come back to (at the start, or near the end). Undefined for a
// song that is not long: it has no place to keep or clear.
export function placeOf(pos: number, length: number): number | null | undefined {
  if (!isLong(length)) return undefined
  if (!Number.isFinite(pos) || pos <= stepBackSec || pos >= length - endSec) return null
  return Math.round(pos * 10) / 10
}

// Where a song with a kept place starts; 0 for none.
export function startOf(p: Position | undefined): number {
  return p ? Math.max(0, p.pos - stepBackSec) : 0
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

function parsePosition(v: unknown): Position | undefined {
  if (!isObject(v) || !isTime(v.pos) || !isTime(v.last) || v.pos === 0) return undefined
  return { pos: v.pos, last: Math.round(v.last) }
}

// The `max` used last, newest first in time but in no set order in the object.
function capped(all: Record<ItemKey, Position>, max = positionsMax): Record<ItemKey, Position> {
  const keys = Object.keys(all) as ItemKey[]
  if (keys.length <= max) return all
  keys.sort((a, b) => all[b].last - all[a].last)
  const out: Record<ItemKey, Position> = {}
  for (const key of keys.slice(0, max)) out[key] = all[key]
  return out
}

// A bad entry is dropped on its own; anything else gives no places.
export function parsePositions(raw: unknown): Record<ItemKey, Position> {
  const out: Record<ItemKey, Position> = {}
  if (!isObject(raw) || !isObject(raw.at)) return out
  for (const [key, v] of Object.entries(raw.at)) {
    const p = parsePosition(v)
    if (p && keepsPlace(key)) out[key] = p
  }
  return capped(out)
}

// Version 1 with an `at` object. Anything else is copied aside before the first save.
export function isKnownPositionsFile(raw: unknown): boolean {
  return isObject(raw) && raw.version === 1 && isObject(raw.at)
}

export function positionsFile(at: Positions): PositionsFile {
  return { version: 1, at }
}

// The place of `key` (seconds), or none (null) to forget it. A new object
// when something changed, else the same. The oldest go past positionsMax.
export function setPosition(
  all: Positions,
  key: ItemKey,
  pos: number | null,
  now: number
): Positions {
  if (!keepsPlace(key)) return all
  if (pos === null) {
    if (!Object.hasOwn(all, key)) return all
    const out = { ...all }
    delete out[key]
    return out
  }
  if (!isTime(pos) || pos === 0 || all[key]?.pos === pos) return all
  return capped({ ...all, [key]: { pos, last: now } })
}

// A set message from the page: the key and the place, or null to forget it.
export function parsePositionSet(
  key: unknown,
  pos: unknown
): { key: ItemKey; pos: number | null } | undefined {
  if (!keepsPlace(key)) return undefined
  if (pos === null) return { key, pos }
  return isTime(pos) && pos > 0 ? { key, pos } : undefined
}

// Songs whose ids changed (see id-moves.ts). When two places land on one
// id, the one kept last stays. The same object when nothing moved.
export function movePositions(all: Positions, plugin: PluginId, moves: IdMoves): Positions {
  const movedTo = (key: string): ItemKey | undefined => {
    const k = splitKey(key)
    return k?.plugin === plugin && Object.hasOwn(moves, k.id)
      ? itemKey(plugin, moves[k.id])
      : undefined
  }
  if (!Object.keys(all).some((key) => movedTo(key))) return all
  // from the places as they were, so a -> b and b -> c both move
  const out: Record<ItemKey, Position> = {}
  for (const [key, p] of Object.entries(all) as [ItemKey, Position][]) {
    const to = movedTo(key) ?? key
    const there = out[to]
    out[to] = there && there.last > p.last ? there : p
  }
  return out
}
