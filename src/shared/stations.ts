// Radio stations: My stations (stations.json) and the titles heard on each
// station (radio-history.json). Main checks both files and what the page sends.
import { coverUrls, type Art } from './library'
import { defaultPalettes, parseThemePalettes, type ThemePalettes } from './palette'
import { cleanName } from './playlists'

export interface Stream {
  url: string
  // kbps, when known
  bitrate?: number
  // 'mp3', 'aac', 'ogg'...
  codec?: string
}

export interface Station {
  // 'rb-<uuid>', or 'metal-only'
  id: string
  name: string
  site?: string
  tags: string[]
  country?: string
  // where the logo came from
  logoUrl?: string
  // the logo in the cover cache, once fetched (ticket 030)
  logo?: StationLogo
  // playlists to read on play (Metal Only)
  pls?: string[]
  streams: Stream[]
  // url of the stream the user picked
  chosen?: string
}

// A station's logo as a cover: its hash in the cover cache and the colors
// picked from it. small: under 64px, too blurry for the stage.
export interface StationLogo {
  hash: string
  palette: ThemePalettes
  small?: boolean
}

// Logos under this many px on their shorter side show as a tile on the stage.
export const smallLogoSide = 64

export interface SavedStations {
  version: 1
  stations: Station[]
}

export interface HistoryEntry {
  at: number
  title: string
}

export interface RadioHistory {
  version: 1
  byStation: Record<string, HistoryEntry[]>
}

export const maxHistory = 50
export const historyKeepMs = 30 * 86_400_000

const maxTags = 20
const maxTextLength = 500

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function text(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim().slice(0, maxTextLength)
  return t || undefined
}

// These end up in a link or a request, so only http and https pass.
function webUrl(v: unknown): string | undefined {
  const t = text(v)
  if (!t) return undefined
  try {
    const u = new URL(t)
    return u.protocol === 'http:' || u.protocol === 'https:' ? t : undefined
  } catch {
    return undefined
  }
}

const hashPattern = /^[0-9a-f]{40}$/

function parseLogo(raw: unknown): StationLogo | undefined {
  if (!isObject(raw) || typeof raw.hash !== 'string' || !hashPattern.test(raw.hash))
    return undefined
  const palette = parseThemePalettes(raw.palette)
  if (!palette) return undefined
  const logo: StationLogo = { hash: raw.hash, palette }
  if (raw.small === true) logo.small = true
  return logo
}

function parseStream(raw: unknown): Stream | undefined {
  if (!isObject(raw)) return undefined
  const url = webUrl(raw.url)
  if (!url) return undefined
  const s: Stream = { url }
  if (typeof raw.bitrate === 'number' && Number.isFinite(raw.bitrate) && raw.bitrate > 0)
    s.bitrate = Math.round(raw.bitrate)
  const codec = text(raw.codec)
  if (codec) s.codec = codec.toLowerCase()
  return s
}

function parseStreams(raw: unknown): Stream[] {
  const out: Stream[] = []
  const seen = new Set<string>()
  for (const r of Array.isArray(raw) ? raw : []) {
    const s = parseStream(r)
    if (!s || seen.has(s.url)) continue
    seen.add(s.url)
    out.push(s)
  }
  return out
}

// Ids go into spindle://radio/<id>, so they stay plain.
const idPattern = /^[A-Za-z0-9_-]{1,200}$/

export function isStationId(v: unknown): v is string {
  return typeof v === 'string' && idPattern.test(v)
}

export function parseStation(raw: unknown): Station | undefined {
  if (!isObject(raw) || typeof raw.id !== 'string' || !idPattern.test(raw.id)) return undefined
  if (typeof raw.name !== 'string') return undefined
  const name = cleanName(raw.name, '')
  if (!name) return undefined
  const streams = parseStreams(raw.streams)
  const pls = (Array.isArray(raw.pls) ? raw.pls : []).map(webUrl).filter((u): u is string => !!u)
  // a station with nothing to play and nothing to look up is no use
  if (!streams.length && !pls.length) return undefined
  const tags = (Array.isArray(raw.tags) ? raw.tags : [])
    .map(text)
    .filter((t): t is string => !!t)
    .slice(0, maxTags)
  const s: Station = { id: raw.id, name, tags, streams }
  const site = webUrl(raw.site)
  if (site) s.site = site
  const country = text(raw.country)
  if (country) s.country = country
  const logoUrl = webUrl(raw.logoUrl)
  if (logoUrl) s.logoUrl = logoUrl
  const logo = parseLogo(raw.logo)
  if (logo) s.logo = logo
  if (pls.length) s.pls = [...new Set(pls)]
  if (typeof raw.chosen === 'string' && streams.some((x) => x.url === raw.chosen))
    s.chosen = raw.chosen
  return s
}

// The file may be old, hand-edited or half written. A bad station is dropped on its own.
export function parseStations(raw: unknown): Station[] {
  const list = isObject(raw) && Array.isArray(raw.stations) ? raw.stations : []
  const out: Station[] = []
  const ids = new Set<string>()
  for (const r of list) {
    const s = parseStation(r)
    if (!s || ids.has(s.id)) continue
    ids.add(s.id)
    out.push(s)
  }
  return out
}

// True when the next save would write the file back as it is. Anything else
// (a newer version, a station this version drops) is copied before it is replaced.
export function isKnownStationsFile(raw: unknown): boolean {
  if (!isObject(raw) || raw.version !== 1 || !Array.isArray(raw.stations)) return false
  return JSON.stringify(stationsFile(parseStations(raw))) === JSON.stringify(raw)
}

export function stationsFile(stations: Station[]): SavedStations {
  return { version: 1, stations }
}

// A known station is replaced where it is; a new one goes to the end.
export function saveStation(list: Station[], station: Station): Station[] {
  return list.some((s) => s.id === station.id)
    ? list.map((s) => (s.id === station.id ? station : s))
    : [...list, station]
}

export function removeStation(list: Station[], id: string): Station[] {
  return list.filter((s) => s.id !== id)
}

// One place up (-1) or down (1). At an end, or for an unknown id, the same list comes back.
export function moveStation(list: Station[], id: string, by: -1 | 1): Station[] {
  const from = list.findIndex((s) => s.id === id)
  const to = from + by
  if (from < 0 || to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

// Only a stream the station has. Anything else comes back unchanged.
export function chooseStream(list: Station[], id: string, url: string): Station[] {
  const s = list.find((x) => x.id === id)
  if (!s || s.chosen === url || !s.streams.some((x) => x.url === url)) return list
  return list.map((x) => (x.id === id ? { ...x, chosen: url } : x))
}

export const sameLogo = (a: StationLogo | undefined, b: StationLogo | undefined): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

// The same list back when the station is not there or has this logo already.
export function setLogo(list: Station[], id: string, logo: StationLogo | undefined): Station[] {
  const s = list.find((x) => x.id === id)
  if (!s || sameLogo(s.logo, logo)) return list
  return list.map((x) => (x.id === id ? withLogo(x, logo) : x))
}

export function withLogo(s: Station, logo: StationLogo | undefined): Station {
  const next = { ...s, logo }
  if (!logo) delete next.logo
  return next
}

// No logo: a tile in the fixed colors.
const noLogo: Art = { palette: defaultPalettes, cover: '', coverLarge: '' }

// The logo as an album's cover, so the app colors, the stage and the media
// controls work as for a song. A small logo is left off the stage.
export function stationArt(s: Station): Art {
  if (!s.logo) return noLogo
  const urls = coverUrls(s.logo.hash)
  return {
    palette: s.logo.palette,
    cover: urls.cover,
    coverLarge: s.logo.small ? '' : urls.coverLarge
  }
}

// Adds streams found on the server. A stream with the same bitrate and codec as
// one listed is skipped. One with no bitrate is never taken for a repeat:
// dropping a real mount is worse than listing a spare one. Returns `saved`
// itself when nothing changed.
export function mergeStreams(saved: Stream[], found: Stream[]): Stream[] {
  let out = saved
  for (const f of found) {
    const at = out.findIndex((s) => s.url === f.url)
    if (at >= 0) {
      const have = out[at]
      const filled = { ...have, bitrate: have.bitrate ?? f.bitrate, codec: have.codec ?? f.codec }
      if (!filled.bitrate) delete filled.bitrate
      if (!filled.codec) delete filled.codec
      if (filled.bitrate !== have.bitrate || filled.codec !== have.codec) {
        out = out.map((s, i) => (i === at ? filled : s))
      }
      continue
    }
    if (f.bitrate && out.some((s) => s.bitrate === f.bitrate && s.codec === f.codec)) continue
    out = [...out, f]
  }
  return out
}

function parseEntries(raw: unknown): HistoryEntry[] {
  const out: HistoryEntry[] = []
  for (const e of Array.isArray(raw) ? raw : []) {
    if (!isObject(e) || typeof e.at !== 'number' || !Number.isFinite(e.at)) continue
    if (typeof e.title !== 'string' || !e.title) continue
    out.push({ at: e.at, title: e.title })
  }
  return out.slice(-maxHistory)
}

export function parseHistory(raw: unknown): RadioHistory {
  const byStation: Record<string, HistoryEntry[]> = {}
  const src = isObject(raw) && isObject(raw.byStation) ? raw.byStation : {}
  for (const [id, entries] of Object.entries(src)) {
    const list = parseEntries(entries)
    if (list.length && idPattern.test(id)) byStation[id] = list
  }
  return { version: 1, byStation }
}

export function historyFile(h: RadioHistory): RadioHistory {
  return h
}

export function isKnownHistoryFile(raw: unknown): boolean {
  if (!isObject(raw) || raw.version !== 1 || !isObject(raw.byStation)) return false
  return JSON.stringify(parseHistory(raw)) === JSON.stringify(raw)
}

// Oldest first, so the newest title is the last. A blank title, or the same one
// again (a reconnect sends it twice), is not added.
export function addTitle(h: RadioHistory, id: string, title: string, at: number): RadioHistory {
  const t = title.trim().slice(0, maxTextLength)
  const list = h.byStation[id] ?? []
  if (!t || list[list.length - 1]?.title === t) return h
  return {
    ...h,
    byStation: { ...h.byStation, [id]: [...list, { at, title: t }].slice(-maxHistory) }
  }
}

// A station that is not in My stations loses its titles 30 days after the last one.
export function pruneHistory(
  h: RadioHistory,
  isSaved: (id: string) => boolean,
  now: number
): RadioHistory {
  const keep = Object.entries(h.byStation).filter(([id, list]) => {
    const last = list[list.length - 1]
    return isSaved(id) || (last !== undefined && now - last.at < historyKeepMs)
  })
  if (keep.length === Object.keys(h.byStation).length) return h
  return { ...h, byStation: Object.fromEntries(keep) }
}
