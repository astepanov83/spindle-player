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

export const pluginCountsPlays = (plugin: PluginId): boolean => counted.has(plugin)

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

// What the page shows of a song when its play counts (ticket 115), kept in
// plays-log.jsonl so the stats still read after the song leaves the library.
export interface PlayedSong {
  title: string
  // as shown: after the names in artists.json
  artist: string
  // each name, only when the credit is several artists (a split)
  artists?: string[]
  album: string
  albumArtist: string
  // seconds; 0 when not known
  length: number
}

// Long enough for any real tag; a longer one is cut.
const nameMax = 1000

const name = (v: unknown): string => (typeof v === 'string' ? v.slice(0, nameMax) : '')

// From the page or a line of the log: what is wrong is left empty, so the
// play still counts.
export function parsePlayedSong(raw: unknown): PlayedSong {
  const o = isObject(raw) ? raw : {}
  const length = o.length
  const out: PlayedSong = {
    title: name(o.title),
    artist: name(o.artist),
    album: name(o.album),
    albumArtist: name(o.albumArtist),
    length: typeof length === 'number' && Number.isFinite(length) && length > 0 ? length : 0
  }
  if (Array.isArray(o.artists)) {
    const names = o.artists.slice(0, 50).map(name).filter(Boolean)
    if (names.length > 1) out.artists = names
  }
  return out
}

// The stats of a year (local time), or of all the log (ticket 116).
export type StatsPeriod = number | 'all'

export interface TopSong {
  // after the id moves the log knows
  key: ItemKey
  title: string
  artist: string
  album: string
  plays: number
  // ms, the latest play in the period
  last: number
}

// An artist or an album. `key`: its song played last, to find its page and
// cover while that song is in the library.
export interface TopGroup {
  name: string
  // an album's artist; '' for an artist
  artist: string
  key: ItemKey
  plays: number
  last: number
}

// How many of each the top lists hold.
export const topCount = 10

// What main answers the stats page: totals only, never the log.
export interface PlayStats {
  period: StatsPeriod
  // the first play in the log, ms; none when the log is empty
  since?: number
  // the years with plays in the log, newest first
  years: number[]
  plays: number
  // the songs' full lengths added up
  seconds: number
  songs: number
  artists: number
  albums: number
  // most played first; a tie goes to the one played last
  topSongs: TopSong[]
  topArtists: TopGroup[]
  topAlbums: TopGroup[]
  // plays per month, "2026-10": a year's twelve, or all time's from the
  // log's first month to now
  months: { month: string; plays: number }[]
  // plays per day of the week, Monday first
  days: number[]
}

export function parseStatsPeriod(raw: unknown): StatsPeriod | undefined {
  if (raw === 'all') return raw
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1970 && raw <= 9999
    ? raw
    : undefined
}
