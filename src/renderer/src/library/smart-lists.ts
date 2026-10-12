// The lists that fill themselves (ticket 118): Loved, Most played,
// Forgotten favorites, Recently added and Never played, at the top of
// Playlists. Made from the plays (085), the hearts (117) and when each album
// came in. Read only: they can be played and copied, not edited. No DOM.
import type { Loved } from '../../../shared/loved'
import type { Plays } from '../../../shared/plays'
import type { ItemKey } from '../../../shared/plugins/items'
import type { IconName } from '../ui/icons'

const day = 24 * 60 * 60 * 1000

// Every number the lists use, in one place. No settings for them yet.
export const smartRules = {
  // songs in Most played
  mostPlayed: 100,
  // plays that make a song a favorite
  favoritePlays: 5,
  // a favorite not played for this long is forgotten: 6 months
  forgottenAfter: 183 * day,
  // albums added this recently are in Recently added
  addedWithin: 30 * day
} as const

export type SmartId = 'loved' | 'most' | 'forgotten' | 'added' | 'never'

export interface SmartList {
  id: SmartId
  name: string
  icon: IconName
  // the line over the title on its page
  about: string
  // why it is empty
  empty: string
}

export const smartLists: readonly SmartList[] = [
  {
    id: 'loved',
    name: 'Loved',
    icon: 'heartOn',
    about: 'Songs you loved, newest first',
    empty: 'Love a song to see it here: right-click it and pick "Love", or press L while it plays.'
  },
  {
    id: 'most',
    name: 'Most played',
    icon: 'mostPlayed',
    about: `The ${smartRules.mostPlayed} songs you played most`,
    empty: 'Nothing played yet. Songs show here once you have played them.'
  },
  {
    id: 'forgotten',
    name: 'Forgotten favorites',
    icon: 'forgotten',
    about: `Played ${smartRules.favoritePlays} times or more, but not in the last 6 months`,
    empty: `Songs you played ${smartRules.favoritePlays} times or more show here once you have not played them for 6 months.`
  },
  {
    id: 'added',
    name: 'Recently added',
    icon: 'added',
    about: 'Albums added in the last 30 days, newest first',
    empty: 'No albums were added in the last 30 days.'
  },
  {
    id: 'never',
    name: 'Never played',
    icon: 'neverPlayed',
    about: 'Songs you have not played yet, in a new order each day',
    empty: 'You have played every song in your library.'
  }
]

export function smartList(id: string): SmartList | undefined {
  return smartLists.find((l) => l.id === id)
}

// A song of the library: its key and when its album came in (ms, 0 when
// not known). Tracks have no time of their own.
export interface SmartSong {
  key: ItemKey
  added: number
}

export interface SmartData {
  // every song of the library, in library order
  songs: readonly SmartSong[]
  plays: Plays
  loved: Loved
  // ms; also picks the day for Never played
  now: number
}

// The songs of a list, in its order. Only songs in the library: a heart or a
// play count kept for a file that is gone shows nowhere.
export function smartItems(id: SmartId, d: SmartData): ItemKey[] {
  return rules[id](d)
}

// ties keep library order (the sort is stable)
const byDesc =
  <T>(...fields: ((x: T) => number)[]) =>
  (a: T, b: T): number => {
    for (const f of fields) {
      const d = f(b) - f(a)
      if (d) return d
    }
    return 0
  }

type Played = { key: ItemKey; n: number; last: number }

function played(d: SmartData): Played[] {
  return d.songs.flatMap((s) => {
    const p = d.plays[s.key]
    return p ? [{ key: s.key, n: p.n, last: p.last }] : []
  })
}

const most = byDesc<Played>(
  (p) => p.n,
  (p) => p.last
)

const rules: Record<SmartId, (d: SmartData) => ItemKey[]> = {
  loved: (d) =>
    d.songs
      .filter((s) => Object.hasOwn(d.loved, s.key))
      .sort(byDesc((s) => d.loved[s.key]))
      .map((s) => s.key),
  most: (d) =>
    played(d)
      .sort(most)
      .slice(0, smartRules.mostPlayed)
      .map((p) => p.key),
  forgotten: (d) => {
    const before = d.now - smartRules.forgottenAfter
    return played(d)
      .filter((p) => p.n >= smartRules.favoritePlays && p.last <= before)
      .sort(most)
      .map((p) => p.key)
  },
  added: (d) => {
    const since = d.now - smartRules.addedWithin
    return d.songs
      .filter((s) => s.added > 0 && s.added >= since)
      .sort(byDesc((s) => s.added))
      .map((s) => s.key)
  },
  never: (d) => {
    const seed = dayOf(d.now)
    return d.songs
      .filter((s) => !Object.hasOwn(d.plays, s.key))
      .map((s) => ({ key: s.key, r: hash(`${seed}\n${s.key}`) }))
      .sort((a, b) => a.r - b.r || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((s) => s.key)
  }
}

// The local date: Never played's order stays the same all day, and a song
// that comes in finds its place in it without moving the rest.
export function dayOf(ms: number): string {
  const t = new Date(ms)
  return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`
}

// FNV-1a, 32 bits: well spread and the same on every run
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// What an open list shows. It keeps the rows it opened with, so nothing
// moves under the user: new songs and a new order wait for Refresh. Only
// songs that `stay` fails for leave at once (gone from the library, or
// unloved in Loved, where Unlove is how a song leaves the list). Nothing
// shown yet: the list as it is now.
export function heldRows(
  held: readonly ItemKey[],
  live: readonly ItemKey[],
  stay: (key: ItemKey) => boolean
): ItemKey[] {
  if (!held.length) return [...live]
  const out = held.filter(stay)
  return out.length === held.length ? (held as ItemKey[]) : out
}

export function sameRows(a: readonly ItemKey[], b: readonly ItemKey[]): boolean {
  return a === b || (a.length === b.length && a.every((k, i) => k === b[i]))
}
