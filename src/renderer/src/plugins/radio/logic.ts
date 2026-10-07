// Radio moves as plain functions: the title's parts, which stream to try next,
// how long to wait. store.svelte.ts plays what they pick.
import {
  historyTitle,
  songArt,
  type HistoryEntry,
  type Station,
  type Stream
} from '../../../../shared/plugins/radio/stations'
import type { LastAnswer } from '../../../../shared/plugins/radio/ipc'
import { parseTitle } from '../../../../shared/plugins/radio/radio-title'
import type { HistoryEntry as LiveEntry } from '../types'

// in shared/, since main looks song covers up by the same parts (ticket 032)
export { parseTitle, type RadioTitleParts } from '../../../../shared/plugins/radio/radio-title'

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
  // "320k", for the bar's button
  short: string
}

// The bitrate picker's list: the best sounding first (so firstStream's pick
// is on top), a tie in list order. A Shoutcast v1 server tells its bitrate
// only in the stream (decision 153), so those come last, in list order, as
// "Bitrate unknown". Labels that would read the same get a number, so mirrors
// of one stream can be told apart. The bar's short text names the codec when
// another codec has the same bitrate ("128k aac", "128k mp3"). The k says it
// is a bitrate: a bare "320" read as nothing in particular.
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
      ? [`${s.bitrate}k`, sharedRate(s) && s.codec].filter(Boolean).join(' ')
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

// Main fetches the stream and passes it on (src/main/plugins/radio/stream.ts). `c`
// makes each connection's address new: Chromium keeps a stream's bytes by
// address and, loaded again at the same one, plays those old seconds instead
// of asking main (seen in the app: a "reconnect" replayed the last 6 s).
export function radioUrl(stationId: string, stream: number, connection: number): string {
  return `spindle://radio/${stationId}?stream=${stream}&c=${connection}`
}

// The station's titles as the core's history (the Queue part's list): each
// title's parts and the cover found for its song. The newest is on air when
// it is `title`, the one playing now.
export function historyEntries(history: HistoryEntry[], title: string): LiveEntry[] {
  // the file keeps a long title cut
  const playingNow = historyTitle(title)
  return history.map((e, i) => {
    const t = parseTitle(e.title)
    const entry: LiveEntry = { title: t.song, at: e.at }
    if (t.artist) entry.subtitle = t.artist
    if (e.cover) entry.art = songArt(e.cover)
    if (i === history.length - 1 && e.title === playingNow) entry.now = true
    return entry
  })
}

// The Radio tab's filter of My stations: name, tag or country.
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
