// The Music For Programming episodes, kept in mfp.json (ticket 052). Its own
// file, not library.json, so an index rebuild doesn't fetch 79 pages again.
// Only a copy of the site, so a broken file just starts empty.
import { parseThemePalettes } from '../../../shared/palette'
import { isCoverHash } from '../../library/cover-names'
import type { MadeCover } from '../covers'
import { parseEpisode, parseSlugs, type MfpEpisode, type MfpTrack } from './site'

export interface MfpData {
  // when the site was last read, ms; 0 for never
  fetchedAt: number
  // the site's picture in the cover cache, shared by every episode. Before
  // ticket 061 a hash alone, which is dropped: the picture is fetched again.
  cover?: MadeCover
  // newest first
  episodes: MfpEpisode[]
}

const version = 1
// fetched again at start after this long
export const staleMs = 24 * 3600 * 1000

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isText = (v: unknown): v is string => typeof v === 'string'
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

function parseTrack(v: unknown): MfpTrack | undefined {
  if (!isObject(v) || !isText(v.artist) || !isText(v.title)) return undefined
  return { artist: v.artist, title: v.title }
}

function parseCover(v: unknown): MadeCover | undefined {
  if (!isObject(v) || !isText(v.hash) || !isCoverHash(v.hash)) return undefined
  const palette = parseThemePalettes(v.palette)
  if (!palette || typeof v.v !== 'number') return undefined
  const out: MadeCover = { hash: v.hash, palette, v: v.v }
  if (v.small === true) out.small = true
  return out
}

function parseStoredEpisode(v: unknown): MfpEpisode | undefined {
  if (!isObject(v)) return undefined
  const { slug, number, title, artist, url, bytes, duration, date, tracks, link } = v
  if (!isText(slug) || !/^[a-z]+$/.test(slug)) return undefined
  if (!isText(url) || !url.startsWith('https://')) return undefined
  if (!isText(title) || !isText(artist) || !isText(link)) return undefined
  if (!isCount(number) || !isCount(bytes) || !isCount(duration)) return undefined
  if (date !== null && !isText(date)) return undefined
  if (!Array.isArray(tracks)) return undefined
  const rows = tracks.map(parseTrack)
  if (rows.some((t) => !t)) return undefined
  return {
    slug,
    number,
    title,
    artist,
    url,
    bytes,
    duration,
    date,
    tracks: rows as MfpTrack[],
    link
  }
}

export function parseMfp(raw: unknown): MfpData {
  const out: MfpData = { fetchedAt: 0, episodes: [] }
  if (!isObject(raw) || raw.version !== version || !Array.isArray(raw.episodes)) return out
  if (isCount(raw.fetchedAt)) out.fetchedAt = raw.fetchedAt
  const cover = parseCover(raw.cover)
  if (cover) out.cover = cover
  for (const v of raw.episodes) {
    const e = parseStoredEpisode(v)
    if (e) out.episodes.push(e)
  }
  return out
}

export function serializeMfp(d: MfpData): unknown {
  return { version, ...d }
}

export function isStale(d: MfpData, now: number): boolean {
  return !d.episodes.length || now - d.fetchedAt >= staleMs
}

export interface RefreshOptions {
  site: string
  // what mfp.json has; these pages are not fetched again
  known: MfpEpisode[]
  // a page's text; throws on a network error or a status that is not ok
  fetchText: (url: string) => Promise<string>
  // pages fetched at once
  atOnce?: number
  log?: (text: string) => void
}

export interface RefreshResult {
  // as the site lists them now, newest first
  episodes: MfpEpisode[]
  // pages fetched and read this time
  fetched: number
  // pages that could not be fetched or read; tried again next time
  failed: number
}

// /latest lists every episode and holds the newest one's data. Then only the
// pages of episodes not known yet are fetched (as in webmusicfp's catalog).
export async function refreshEpisodes(o: RefreshOptions): Promise<RefreshResult> {
  const log = o.log ?? ((): void => {})
  const latestHtml = await o.fetchText(`${o.site}/latest`)
  const slugs = parseSlugs(latestHtml)
  if (!slugs.length) throw new Error(`${o.site}/latest lists no episodes`)

  const known = new Map(o.known.map((e) => [e.slug, e]))
  const latest = parseEpisode(latestHtml, o.site)
  if (latest) known.set(latest.slug, latest)

  const wanted = slugs.filter((s) => !known.has(s))
  let fetched = 0
  let failed = 0
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < wanted.length) {
      const slug = wanted[next++]
      try {
        const e = parseEpisode(await o.fetchText(`${o.site}/${slug}`), o.site)
        if (!e) throw new Error('no episode data on the page')
        known.set(slug, e)
        fetched++
      } catch (err) {
        failed++
        log(`Music For Programming: skipped ${slug}: ${(err as Error)?.message ?? err}`)
      }
    }
  }
  const atOnce = Math.min(o.atOnce ?? 4, wanted.length)
  await Promise.all(Array.from({ length: atOnce }, worker))

  const episodes = slugs.map((s) => known.get(s)).filter((e): e is MfpEpisode => !!e)
  episodes.sort((a, b) => b.number - a.number)
  return { episodes, fetched, failed }
}
