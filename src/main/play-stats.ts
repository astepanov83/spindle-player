// Counts the lines of plays-log.jsonl (ticket 115) into what the stats page
// shows (ticket 116), one line at a time, so the log is never held whole.
import type { IdMoves } from '../shared/id-moves'
import {
  countsPlays,
  parsePlayedSong,
  topCount,
  type PlayStats,
  type StatsPeriod,
  type TopGroup,
  type TopSong
} from '../shared/plays'
import { isPluginId, type PluginId } from '../shared/plugins'
import { itemKey, splitKey, type ItemKey } from '../shared/plugins/items'

// One play, as the log keeps it. Short names: there is a line per play.
export interface PlayLine {
  k: ItemKey
  // ms since 1970
  t: number
  // the song's length, seconds
  d: number
  a: string
  // each name of a split credit; none for one artist
  as?: string[]
  al: string
  aa: string
  ti: string
}

// Ids a rescan moved (see id-moves.ts). The plays above it are read with the
// new ids; the file is never rewritten.
export interface MoveLine {
  moved: PluginId
  ids: IdMoves
}

export type LogLine = PlayLine | MoveLine

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// A bad line is skipped on its own; so is a line of a kind this build doesn't know.
export function parseLogLine(raw: unknown): LogLine | undefined {
  if (!isObject(raw)) return undefined
  if (raw.moved !== undefined) {
    if (!isPluginId(raw.moved) || !isObject(raw.ids)) return undefined
    const ids: IdMoves = {}
    for (const [from, to] of Object.entries(raw.ids))
      if (typeof to === 'string' && to) ids[from] = to
    return { moved: raw.moved, ids }
  }
  const { k, t } = raw
  if (!countsPlays(k) || typeof t !== 'number' || !Number.isFinite(t) || t < 0) return undefined
  const s = parsePlayedSong({
    title: raw.ti,
    artist: raw.a,
    artists: raw.as,
    album: raw.al,
    albumArtist: raw.aa,
    length: raw.d
  })
  const line: PlayLine = {
    k,
    t,
    d: s.length,
    a: s.artist,
    al: s.album,
    aa: s.albumArtist,
    ti: s.title
  }
  if (s.artists) line.as = s.artists
  return line
}

interface Counted {
  plays: number
  last: number
}

interface SongCount extends Counted {
  key: ItemKey
  title: string
  artist: string
  album: string
}

interface GroupCount extends Counted {
  name: string
  artist: string
  key: ItemKey
}

// Names that differ only by case or spacing are one, as in the Artists view.
const fold = (name: string): string => name.normalize('NFC').toLowerCase().replace(/\s+/g, '')

// Most played first; a tie goes to the one played last, then by name.
function top<T extends Counted>(m: Map<string, T>, name: (v: T) => string): T[] {
  return [...m.values()]
    .sort((x, y) => y.plays - x.plays || y.last - x.last || name(x).localeCompare(name(y)))
    .slice(0, topCount)
}

const monthOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

// The months from `from` to `to`, both in, as "2026-10".
function monthsBetween(from: Date, to: Date): string[] {
  const out: string[] = []
  const d = new Date(from.getFullYear(), from.getMonth(), 1)
  while (d <= to) {
    out.push(monthOf(d))
    d.setMonth(d.getMonth() + 1)
  }
  return out
}

// Fed every line of the log in file order. Years are in local time, as the
// page shows them.
export class StatsCounter {
  #since: number | undefined
  #latest = 0
  #years = new Set<number>()
  #plays = 0
  #seconds = 0
  #songs = new Map<ItemKey, SongCount>()
  #artists = new Map<string, GroupCount>()
  #albums = new Map<string, GroupCount>()
  #months = new Map<string, number>()
  #days = [0, 0, 0, 0, 0, 0, 0]

  constructor(
    readonly period: StatsPeriod,
    readonly now: number
  ) {}

  line(line: LogLine): void {
    if ('moved' in line) this.#move(line)
    else this.#play(line)
  }

  #play(p: PlayLine): void {
    const date = new Date(p.t)
    const year = date.getFullYear()
    this.#since = Math.min(this.#since ?? p.t, p.t)
    this.#latest = Math.max(this.#latest, p.t)
    this.#years.add(year)
    if (this.period !== 'all' && year !== this.period) return
    this.#plays++
    this.#seconds += p.d
    const song = this.#songs.get(p.k)
    if (!song)
      this.#songs.set(p.k, { key: p.k, title: p.ti, artist: p.a, album: p.al, plays: 1, last: p.t })
    else
      this.#count(song, p.t, () => Object.assign(song, { title: p.ti, artist: p.a, album: p.al }))
    for (const name of p.as ?? [p.a]) if (name) this.#group(this.#artists, fold(name), name, '', p)
    const albumArtist = p.aa || p.a
    if (p.al) this.#group(this.#albums, `${fold(albumArtist)}\n${fold(p.al)}`, p.al, albumArtist, p)
    const month = monthOf(date)
    this.#months.set(month, (this.#months.get(month) ?? 0) + 1)
    this.#days[(date.getDay() + 6) % 7]++
  }

  // One more play; the names of the latest play are the ones shown.
  #count(c: Counted, t: number, newer: () => void): void {
    c.plays++
    if (t >= c.last) {
      c.last = t
      newer()
    }
  }

  #group(m: Map<string, GroupCount>, id: string, name: string, artist: string, p: PlayLine): void {
    const g = m.get(id)
    if (!g) m.set(id, { name, artist, key: p.k, plays: 1, last: p.t })
    else this.#count(g, p.t, () => Object.assign(g, { name, artist, key: p.k }))
  }

  // Plays read so far move to the new ids, and add up with any already there.
  #move({ moved: plugin, ids }: MoveLine): void {
    const to = (key: ItemKey): ItemKey | undefined => {
      const k = splitKey(key)
      return k?.plugin === plugin && Object.hasOwn(ids, k.id)
        ? itemKey(plugin, ids[k.id])
        : undefined
    }
    for (const [key, song] of [...this.#songs]) {
      const next = to(key)
      if (!next) continue
      this.#songs.delete(key)
      const there = this.#songs.get(next)
      const newer = there && there.last >= song.last ? there : song
      this.#songs.set(next, { ...newer, key: next, plays: song.plays + (there?.plays ?? 0) })
    }
    for (const g of [...this.#artists.values(), ...this.#albums.values()])
      g.key = to(g.key) ?? g.key
  }

  result(): PlayStats {
    const songs: TopSong[] = top(this.#songs, (s) => s.title).map(
      ({ key, title, artist, album, plays, last }) => ({ key, title, artist, album, plays, last })
    )
    const groups = (m: Map<string, GroupCount>): TopGroup[] =>
      top(m, (g) => g.name).map(({ name, artist, key, plays, last }) => ({
        name,
        artist,
        key,
        plays,
        last
      }))
    const out: PlayStats = {
      period: this.period,
      years: [...this.#years].sort((a, b) => b - a),
      plays: this.#plays,
      seconds: Math.round(this.#seconds),
      songs: this.#songs.size,
      artists: this.#artists.size,
      albums: this.#albums.size,
      topSongs: songs,
      topArtists: groups(this.#artists),
      topAlbums: groups(this.#albums),
      months: this.#monthList().map((month) => ({ month, plays: this.#months.get(month) ?? 0 })),
      days: [...this.#days]
    }
    if (this.#since !== undefined) out.since = this.#since
    return out
  }

  #monthList(): string[] {
    if (this.period !== 'all')
      return monthsBetween(new Date(this.period, 0), new Date(this.period, 11))
    if (this.#since === undefined) return []
    return monthsBetween(new Date(this.#since), new Date(Math.max(this.now, this.#latest)))
  }
}
