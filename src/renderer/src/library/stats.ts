// The stats page's parts that are no DOM (ticket 116). Main counts the log
// (shared/play-stats.ts); this picks the periods, words the numbers, lays out
// the columns, and fills the top lists from plays.json before the log began.
import { foldName, StatsCounter, type PlayLine } from '../../../shared/play-stats'
import type { PlayedSong, Plays, PlayStats, StatsPeriod } from '../../../shared/plays'
import type { ItemKey } from '../../../shared/plugins/items'
import type { Art } from '../../../shared/library'
import type { CoverArt, ItemInfo, PageAddress } from '../plugins/types'

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

// A row of a top list (StatsTop.svelte).
export interface TopRow {
  id: string
  name: string
  sub?: string
  plays: number
  // an artist's round picture, or a cover
  pic: { round: true; photo?: string; covers: CoverArt[] } | { round?: false; art?: Art }
  to?: PageAddress
  // its songs, for Play and the menu; none when it left the library
  songs?: () => ItemKey[]
  play?: () => void
}

export interface PeriodOption {
  value: StatsPeriod
  label: string
}

// This year, Last year, each earlier year of the log, All time. Last year and
// the earlier ones only when the log has plays in them: an empty year to pick
// says nothing. `years`: the log's, newest first.
export function periodOptions(years: readonly number[], thisYear: number): PeriodOption[] {
  const out: PeriodOption[] = [{ value: thisYear, label: 'This year' }]
  for (const y of years)
    if (y === thisYear - 1) out.push({ value: y, label: 'Last year' })
    else if (y < thisYear - 1) out.push({ value: y, label: String(y) })
  out.push({ value: 'all', label: 'All time' })
  return out
}

// The period the page shows before one is picked: this year once the log has
// a play in it, else all time (plays.json's top lists, or the years before).
export function firstPeriod(years: readonly number[], thisYear: number): StatsPeriod {
  return years.includes(thisYear) ? thisYear : 'all'
}

// The time listened, in hours: one decimal under 10, whole above. "0.4", "12", "1,284".
export function hoursText(seconds: number): string {
  const h = seconds / 3600
  if (h < 10) return (Math.round(h * 10) / 10).toLocaleString()
  return Math.round(h).toLocaleString()
}

// "13 October 2026"
export function dayText(at: number): string {
  const d = new Date(at)
  return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`
}

// "2026-10" as a column's name in full ("October 2026") and short: the
// month's first three letters, or its first letter where they don't fit.
export function monthText(month: string): { full: string; short: string; letter: string } {
  const [y, m] = month.split('-').map(Number)
  const name = monthNames[m - 1] ?? ''
  return { full: `${name} ${y}`, short: name.slice(0, 3), letter: name.slice(0, 1) }
}

export const dayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
]

// A column chart's scale: the top of the axis and its lines, clean numbers
// (1, 2, 5 times a power of ten), at most `most` steps above 0.
export function chartScale(max: number, most = 4): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0, 1] }
  let step: number | undefined
  for (let p = 1; step === undefined; p *= 10)
    step = [1, 2, 5].map((f) => f * p).find((s) => Math.ceil(max / s) <= most)
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let t = 0; t <= top; t += step) ticks.push(t)
  return { top, ticks }
}

// Which columns of all time's months get a name under them when there are
// many: each January (as its year), and the first column.
export function monthLabels(months: readonly string[]): string[] {
  if (months.length <= 12) return months.map((m) => monthText(m).short)
  return months.map((m, i) => (i === 0 || m.endsWith('-01') ? m.slice(0, 4) : ''))
}

// plays.json counts every play the log does, and the ones from before the
// log began (ticket 085 came first). While it holds more plays than the log,
// all time's top lists are counted from it: the songs that are in the
// library now, with their names now. The totals and the columns stay the
// log's: plays.json has no dates but the last.
export function withOlderPlays(
  stats: PlayStats,
  plays: Plays,
  song: (key: ItemKey) => PlayedSong | undefined,
  now: number
): { stats: PlayStats; older: boolean } {
  if (stats.period !== 'all') return { stats, older: false }
  let total = 0
  for (const p of Object.values(plays)) total += p.n
  if (total <= stats.plays) return { stats, older: false }
  const counter = new StatsCounter('all', now)
  for (const [key, p] of Object.entries(plays) as [ItemKey, Plays[ItemKey]][]) {
    const s = song(key)
    if (!s) continue
    const line: PlayLine = {
      k: key,
      t: p.last,
      d: s.length,
      a: s.artist,
      al: s.album,
      aa: s.albumArtist,
      ti: s.title
    }
    if (s.artists) line.as = s.artists
    counter.line(line, p.n)
  }
  const r = counter.result()
  return {
    stats: { ...stats, topSongs: r.topSongs, topArtists: r.topArtists, topAlbums: r.topAlbums },
    older: true
  }
}

// A top artist's page, from its song played last: the name of that song's
// credit that is the same artist (case and spacing aside). None when the
// song's artists changed since, so a click never opens someone else.
export function artistTo(info: ItemInfo | undefined, name: string): PageAddress | undefined {
  const f = foldName(name)
  return info?.names?.find((n) => foldName(n.name) === f)?.to
}

// A top album's page, from its song played last, while that song is still on it.
export function albumTo(info: ItemInfo | undefined, name: string): PageAddress | undefined {
  return info?.group !== undefined && foldName(info.group) === foldName(name)
    ? info.groupTo
    : undefined
}
