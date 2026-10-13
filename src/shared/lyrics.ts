// Song words (tickets 120, 121): read from an .lrc file or the song's tags
// when it starts, and later looked up online. One parser for all of them, so
// an .lrc file, a tag and an online answer give the same thing.

// A line and when it starts, in seconds into the song.
export interface LyricLine {
  t: number
  text: string
}

// Synced: lines with times, the one being sung is lit. Plain: words with no
// times, shown as one block. Instrumental: an online lookup said the song has
// no words (ticket 121).
export type Lyrics = { synced: LyricLine[] } | { plain: string } | { instrumental: true }

// What the page knows of the song that starts: for a lookup by name (ticket 121).
export interface LyricsSong {
  artist: string
  title: string
  album: string
  // seconds, 0 when unknown
  duration: number
}

// An .lrc file bigger than this is not read.
export const maxLrcBytes = 256 * 1024
// Caps, so a broken file or tag can't make a huge page.
const maxLines = 3000
const maxLineChars = 500
const maxPlainChars = 100_000
const maxSongText = 500

// [mm:ss], [mm:ss.xx], [mm:ss.xxx]; some files write [mm:ss:xx]
const stampRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/y
// [ar:Artist], [ti:Title], [length:3:20], [#comment]: words about the song
const tagLineRe = /^\[(?:[a-z#][^\]]*)\]\s*$/i
// enhanced LRC times each word: <mm:ss.xx>
const wordStampRe = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g

function stampSeconds(m: RegExpExecArray): number {
  const frac = m[3] ? Number('0.' + m[3]) : 0
  return Number(m[1]) * 60 + Number(m[2]) + frac
}

// "[offset:+250]" in ms: plus shows the words sooner.
function offsetOf(line: string): number | undefined {
  const m = /^\[offset:\s*([+-]?\d{1,7})\s*\]\s*$/i.exec(line)
  return m ? Number(m[1]) / 1000 : undefined
}

const cut = (s: string, max: number): string => (s.length > max ? s.slice(0, max) : s)

// LRC text, or plain words. Lines with no time stamp are dropped from synced
// words; text with no stamp at all is plain. Undefined when there are no words.
export function parseLyricsText(text: string): Lyrics | undefined {
  const rows = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)
  const lines: LyricLine[] = []
  let offset = 0
  for (const row of rows) {
    const line = row.trim()
    if (!line.startsWith('[')) continue
    const off = offsetOf(line)
    if (off !== undefined) {
      offset = off
      continue
    }
    // several stamps on one line: the same words at each time
    const times: number[] = []
    stampRe.lastIndex = 0
    let at = 0
    for (let m = stampRe.exec(line); m; m = stampRe.exec(line)) {
      times.push(stampSeconds(m))
      at = stampRe.lastIndex
    }
    if (!times.length) continue
    const words = cut(line.slice(at).replace(wordStampRe, '').trim(), maxLineChars)
    for (const t of times) if (lines.length < maxLines) lines.push({ t, text: words })
  }
  if (lines.length) {
    // the sort keeps file order for lines at the same time
    const synced = lines
      .map((l) => ({ t: Math.max(0, Math.round((l.t - offset) * 1000) / 1000), text: l.text }))
      .sort((a, b) => a.t - b.t)
    // only times: nothing to show
    return synced.some((l) => l.text) ? { synced } : undefined
  }
  const plain = cut(
    rows
      .filter((r) => !tagLineRe.test(r.trim()))
      .join('\n')
      .trim(),
    maxPlainChars
  )
  return plain ? { plain } : undefined
}

// A seek to a line's time can come back a few microseconds short: a disc
// image track's time is the file's time minus the track's start, and
// Chromium keeps time in whole microseconds. That lit the line before.
const earlySec = 0.001

// The line being sung at `t` seconds: the last that started (or starts within
// earlySec); -1 before the first.
export function lineAt(lines: readonly LyricLine[], t: number): number {
  let lo = 0
  let hi = lines.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].t <= t + earlySec) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

// The song as the page sends it; undefined when it is not one.
export function parseLyricsSong(v: unknown): LyricsSong | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const r = v as Record<string, unknown>
  const text = (x: unknown): string | undefined =>
    typeof x === 'string' ? cut(x, maxSongText) : undefined
  const artist = text(r.artist)
  const title = text(r.title)
  const album = text(r.album)
  if (artist === undefined || title === undefined || album === undefined) return undefined
  const d = r.duration
  const duration = typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : 0
  return { artist, title, album, duration }
}
