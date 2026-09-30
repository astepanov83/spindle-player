// Radio moves as plain functions: the title's parts, which stream to try next,
// how long to wait. stores/radio.svelte.ts plays what they pick.
import {
  historyTitle,
  type HistoryEntry,
  type Station,
  type Stream
} from '../../../shared/stations'
import type { LastAnswer } from '../../../shared/ipc'
import { coverUrls } from '../../../shared/library'
import { parseTitle } from '../../../shared/radio-title'

// in shared/, since main looks song covers up by the same parts (ticket 032)
export { parseTitle, type RadioTitleParts } from '../../../shared/radio-title'

// aac, opus and vorbis sound like mp3 at about 1.5 times the bitrate
const codecWeight: Record<string, number> = { aac: 1.5, opus: 1.6, vorbis: 1.3 }

// How good a stream should sound. 0 for an unknown bitrate (Shoutcast v1).
function quality(s: Stream): number {
  return (s.bitrate ?? 0) * (codecWeight[s.codec ?? ''] ?? 1)
}

// The stream to start with: the user's choice, else the best sounding, a tie
// in list order. Starting high is safe: nextStream steps down if it fails.
// -1 for none.
export function firstStream(station: Station): number {
  const { streams } = station
  if (!streams.length) return -1
  const at = streams.findIndex((s) => s.url === station.chosen)
  if (at >= 0) return at
  let best = 0
  streams.forEach((s, i) => {
    if (quality(s) > quality(streams[best])) best = i
  })
  return best
}

// The stream to try after `from` failed, nearest bitrate first; a tie goes to
// the lower one, which is likelier to come through a weak network. Streams of
// unknown bitrate (a Shoutcast v1 server tells its bitrate only in the stream)
// come after the known ones, in list order. From a stream of unknown bitrate,
// all go in list order. -1 when all have failed.
export function nextStream(streams: Stream[], from: number, failed: Set<number>): number {
  const left = streams.map((s, i) => ({ i, br: s.bitrate })).filter((x) => !failed.has(x.i))
  if (!left.length) return -1
  const br = streams[from]?.bitrate
  if (!br) return left[0].i
  const known = left.filter((x) => x.br)
  if (!known.length) return left[0].i
  known.sort((a, b) => Math.abs(a.br! - br) - Math.abs(b.br! - br) || a.br! - b.br! || a.i - b.i)
  return known[0].i
}

export interface StreamChoice {
  // into station.streams
  index: number
  // "320 kbps mp3", for the list
  label: string
  // "320", for the bar's button
  short: string
}

// The bitrate picker's list: the best sounding first (so firstStream's pick
// is on top), a tie in list order. A Shoutcast v1 server tells its bitrate
// only in the stream (decision 153), so those come last, in list order, as
// "Bitrate unknown". Labels that would read the same get a number, so mirrors
// of one stream can be told apart. The bar's short text names the codec when
// another codec has the same bitrate ("128 aac", "128 mp3").
export function streamChoices(streams: Stream[]): StreamChoice[] {
  const order = streams
    .map((s, index) => ({ s, index }))
    .sort((a, b) => quality(b.s) - quality(a.s) || a.index - b.index)
  const seen = new Map<string, number>()
  const sharedRate = (s: Stream): boolean =>
    streams.some((o) => o.bitrate === s.bitrate && o.codec !== s.codec)
  return order.map(({ s, index }) => {
    let label = s.bitrate
      ? [`${s.bitrate} kbps`, s.codec].filter(Boolean).join(' ')
      : s.codec
        ? `${s.codec}, bitrate unknown`
        : 'Bitrate unknown'
    const n = (seen.get(label) ?? 0) + 1
    seen.set(label, n)
    if (n > 1) label += ` (${n})`
    const short = s.bitrate
      ? [String(s.bitrate), sharedRate(s) && s.codec].filter(Boolean).join(' ')
      : (s.codec ?? 'Stream')
    return { index, label, short }
  })
}

const delaysMs = [1000, 2000, 4000, 8000, 16000, 30000]

// The wait before the n-th reconnect (0 is the first) of a station.
export function retryDelayMs(n: number): number {
  return delaysMs[Math.min(n, delaysMs.length - 1)]
}

// Next (1) or Previous (-1) through My stations, wrapping around. From a
// station not in the list: the first, or the last going back.
export function stepStation(list: { id: string }[], id: string, by: 1 | -1): string | undefined {
  if (!list.length) return undefined
  const at = list.findIndex((s) => s.id === id)
  if (at < 0) return list[by > 0 ? 0 : list.length - 1].id
  return list[(at + by + list.length) % list.length].id
}

// Before any sound on a connection, this much audio passed on by main means
// Chromium can't read the format. A live WMA stream never fails by itself (it
// loads on and on with no metadata), and error 4 also comes when main answers
// 502, so neither the error nor its message tells a format apart.
export const formatBytes = 32 * 1024

export function cantPlayFormat(heardSound: boolean, a: LastAnswer | undefined): boolean {
  return !heardSound && !!a?.ok && a.bytes >= formatBytes
}

// Main fetches the stream and passes it on (src/main/radio/stream.ts). `c`
// makes each connection's address new: Chromium keeps a stream's bytes by
// address and, loaded again at the same one, plays those old seconds instead
// of asking main (seen in the app: a "reconnect" replayed the last 6 s).
export function radioUrl(stationId: string, stream: number, connection: number): string {
  return `spindle://radio/${stationId}?stream=${stream}&c=${connection}`
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// When a recent song was heard: "21:14" today, "28 Sep" before (the file keeps
// a station's titles for up to 30 days after its last play).
export function heardAt(at: number, now: number): string {
  const d = new Date(at)
  if (d.toDateString() !== new Date(now).toDateString()) {
    return `${d.getDate()} ${months[d.getMonth()]}`
  }
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ms until the next local midnight, when today's times turn into days
export function msToMidnight(now: number): number {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now
}

export interface RecentRow {
  key: string
  time: string
  artist: string
  song: string
  // the title playing now
  now: boolean
  // the small cover found for the song (ticket 032), or ''
  cover: string
}

// The Queue part's rows while radio plays: newest first. `current` is the
// title playing now, or undefined when stopped; only the newest can be it.
export function recentRows(
  history: HistoryEntry[],
  current: string | undefined,
  now: number
): RecentRow[] {
  // the file keeps a long title cut
  const playingNow = current === undefined ? undefined : historyTitle(current)
  return history
    .map((e, i) => {
      const t = parseTitle(e.title)
      return {
        key: `${e.at}:${e.title}`,
        time: heardAt(e.at, now),
        artist: t.artist,
        song: t.song,
        now: i === history.length - 1 && e.title === playingNow,
        cover: e.cover ? coverUrls(e.cover.hash).cover : ''
      }
    })
    .reverse()
}

// What "Back to queue" goes back to: "From Late Night, 42 songs".
export function backNote(from: string, count: number): string {
  if (!count) return 'The queue is empty'
  const songs = `${count.toLocaleString('en-US')} ${count === 1 ? 'song' : 'songs'}`
  return from ? `From ${from}, ${songs}` : songs
}

// The Radio view's filter of My stations: name, tag or country.
export function stationMatches(s: Station, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return [s.name, ...s.tags, s.country ?? ''].some((x) => x.toLowerCase().includes(t))
}

// "64-320 kbps": the lowest to the highest known bitrate; the picker lists them all.
export function bitrateLine(s: Station): string {
  const rates = s.streams.map((x) => x.bitrate).filter((b): b is number => !!b)
  if (!rates.length) return ''
  const lo = Math.min(...rates)
  const hi = Math.max(...rates)
  return lo === hi ? `${hi} kbps` : `${lo}-${hi} kbps`
}

// "ambient, drone · us" under the station's name.
export function stationLine(s: Station): string {
  const tags = s.tags.slice(0, 3).join(', ')
  return [tags, s.country?.toLowerCase() ?? ''].filter(Boolean).join(' · ')
}

// Radio Browser's stations less those in My stations, which show above them.
export function searchRows(results: Station[], saved: Station[]): Station[] {
  const ids = new Set(saved.map((s) => s.id))
  return results.filter((s) => !ids.has(s.id))
}
