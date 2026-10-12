// Songs heard on radio that the user kept with the heart (ticket 119), in
// heard.json in userData. Main owns the file and checks what the page asks;
// the page shows the list on the Radio tab's "Heard on radio" page.
import { cleanArtist, cleanSong } from '../../clean-names'
import { parseThemePalettes } from '../../palette'
import { stationIdPattern } from './ids'
import { parseTitle } from './radio-title'
import { historyTitle, type SongCover } from './stations'

export interface HeardSong {
  // the stream's title as radio-history.json keeps it
  raw: string
  // from parseTitle; artist is '' for a title with no " - "
  artist: string
  song: string
  // the station's name when the song was saved, and its id
  station: string
  stationId: string
  // when it was heard, ms since 1970
  at: number
  // the cover the song cover lookup found (ticket 032), if it found one
  art?: SongCover
}

export interface HeardFile {
  version: 1
  // oldest first
  songs: HeardSong[]
}

const maxText = 500
const hashPattern = /^[0-9a-f]{40}$/

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, maxText) : '')

// Two titles are the same song when artist and song are the same after the
// cover lookup's cleanup: case, accents, "(Remastered)" and "feat." don't
// count. A title with no artist (a jingle, a show) by its whole text.
export function heardKey(raw: string): string {
  const t = parseTitle(raw)
  if (t.artist && t.song) {
    const artist = cleanArtist(t.artist)
    const song = cleanSong(t.song)
    if (artist && song) return `${artist}\n${song}`
  }
  return '\n' + (cleanSong(t.track) || t.track.toLowerCase())
}

function parseCover(raw: unknown): SongCover | undefined {
  if (!isObject(raw) || typeof raw.hash !== 'string' || !hashPattern.test(raw.hash))
    return undefined
  const palette = parseThemePalettes(raw.palette)
  if (!palette) return undefined
  const c: SongCover = { hash: raw.hash, palette }
  if (raw.small === true) c.small = true
  return c
}

function parseSong(raw: unknown): HeardSong | undefined {
  if (!isObject(raw)) return undefined
  const title = typeof raw.raw === 'string' ? historyTitle(raw.raw) : ''
  if (!title) return undefined
  if (typeof raw.stationId !== 'string' || !stationIdPattern.test(raw.stationId)) return undefined
  if (typeof raw.at !== 'number' || !Number.isFinite(raw.at) || raw.at < 0) return undefined
  const parts = parseTitle(title)
  const s: HeardSong = {
    raw: title,
    // as the file has them, else from the title
    artist: typeof raw.artist === 'string' ? text(raw.artist) : parts.artist,
    song: typeof raw.song === 'string' && text(raw.song) ? text(raw.song) : parts.song,
    station: text(raw.station),
    stationId: raw.stationId,
    at: Math.round(raw.at)
  }
  const art = parseCover(raw.art)
  if (art) s.art = art
  return s
}

// The file may be hand-edited or half written: a bad entry is dropped on its
// own, and a song in it twice is kept once.
export function parseHeard(raw: unknown): HeardSong[] {
  const list = isObject(raw) && Array.isArray(raw.songs) ? raw.songs : []
  const out: HeardSong[] = []
  const keys = new Set<string>()
  for (const r of list) {
    const s = parseSong(r)
    if (!s || keys.has(heardKey(s.raw))) continue
    keys.add(heardKey(s.raw))
    out.push(s)
  }
  return out.sort((a, b) => a.at - b.at)
}

// Version 1 with a songs list. Anything else is copied aside before the first save.
export function isKnownHeardFile(raw: unknown): boolean {
  return isObject(raw) && raw.version === 1 && Array.isArray(raw.songs)
}

export function heardFile(songs: HeardSong[]): HeardFile {
  return { version: 1, songs }
}

// A title heard on a station, as the file keeps it. Undefined for a blank one.
export function heardSong(
  title: string,
  station: { id: string; name: string },
  at: number,
  art?: SongCover
): HeardSong | undefined {
  return parseSong({ raw: title, station: station.name, stationId: station.id, at, art })
}

export function findHeard(list: HeardSong[], raw: string): HeardSong | undefined {
  const key = heardKey(raw)
  return list.find((s) => heardKey(s.raw) === key)
}

// In its place by when it was heard. The same list back when the song is in it.
export function addHeard(list: HeardSong[], song: HeardSong): HeardSong[] {
  if (findHeard(list, song.raw)) return list
  const at = list.findIndex((s) => s.at > song.at)
  const next = [...list]
  next.splice(at < 0 ? list.length : at, 0, song)
  return next
}

// The same list back when the song is not in it.
export function removeHeard(list: HeardSong[], raw: string): HeardSong[] {
  const s = findHeard(list, raw)
  return s ? list.filter((x) => x !== s) : list
}

// A cover found after the song was saved: the lookup is behind the title.
// Only a song with none takes it; the same list back otherwise.
export function withHeardCover(list: HeardSong[], raw: string, art: SongCover): HeardSong[] {
  const s = findHeard(list, raw)
  if (!s || s.art) return list
  return list.map((x) => (x === s ? { ...x, art } : x))
}

// The covers the cover prune must keep.
export function heardHashes(list: HeardSong[]): string[] {
  return [...new Set(list.flatMap((s) => (s.art ? [s.art.hash] : [])))]
}
