// How often each song was played and when last (ticket 085), kept in
// plays.json in userData by item key, so a rescan keeps them. Main counts a
// play when the page says one was heard (see renderer/src/library/plays.ts
// for the rule) and writes the file a bit later.
import { plugins, type PluginId } from './plugins'
import { itemKey, splitKey, type ItemKey } from './plugins/items'
import type { IdMoves } from './id-moves'

export interface Play {
  // times played
  n: number
  // when it was last played, ms since 1970
  last: number
}

export type Plays = Readonly<Record<ItemKey, Play>>

export interface PlaysFile {
  version: 1
  plays: Plays
}

// Only plugins that say so (files): a station never ends, and MFP's songs
// are guessed times inside a mix.
const counted = new Set<string>(plugins.filter((p) => p.countsPlays).map((p) => p.id))

export function countsPlays(key: unknown): key is ItemKey {
  if (typeof key !== 'string' || key.length > 5000) return false
  const k = splitKey(key)
  return !!k && counted.has(k.plugin)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parsePlay(v: unknown): Play | undefined {
  if (!isObject(v)) return undefined
  const { n, last } = v
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return undefined
  if (typeof last !== 'number' || !Number.isFinite(last) || last < 0) return undefined
  return { n, last: Math.round(last) }
}

// A bad entry is dropped on its own; anything else gives no plays.
export function parsePlays(raw: unknown): Record<ItemKey, Play> {
  const out: Record<ItemKey, Play> = {}
  if (!isObject(raw) || !isObject(raw.plays)) return out
  for (const [key, v] of Object.entries(raw.plays)) {
    const p = parsePlay(v)
    if (p && countsPlays(key)) out[key] = p
  }
  return out
}

// Version 1 with a plays object. Anything else is copied aside before the first save.
export function isKnownPlaysFile(raw: unknown): boolean {
  return isObject(raw) && raw.version === 1 && isObject(raw.plays)
}

export function playsFile(plays: Plays): PlaysFile {
  return { version: 1, plays }
}

// One more play of `key`, at `now`. A new object, so the page sees the change.
export function addPlay(plays: Plays, key: ItemKey, now: number): Plays {
  const old = plays[key]
  return { ...plays, [key]: { n: (old?.n ?? 0) + 1, last: Math.max(now, old?.last ?? 0) } }
}

// Songs whose ids changed (see id-moves.ts). When both the old and the new id
// have plays, they add up. The same object when nothing moved.
export function movePlays(plays: Plays, plugin: PluginId, moves: IdMoves): Plays {
  let out: Record<ItemKey, Play> | undefined
  for (const key of Object.keys(plays) as ItemKey[]) {
    const k = splitKey(key)
    if (k?.plugin !== plugin || !Object.hasOwn(moves, k.id)) continue
    out ??= { ...plays }
    // what is under the key now: another move may have added to it
    const p = out[key]
    if (!p) continue
    delete out[key]
    const to = itemKey(plugin, moves[k.id])
    // the old entry is gone from `out` already, so `to` holds only other plays
    const there = out[to]
    out[to] = there ? { n: there.n + p.n, last: Math.max(there.last, p.last) } : p
  }
  return out ?? plays
}
