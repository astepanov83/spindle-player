// What the online cover lookup found, by album id (ticket 014), and the artist
// photos it found, by artist key (ticket 021). Its own file, not
// library.json: the index is thrown away and made again on a version change,
// and this took up to an hour of requests to fill.
import { coverSources, type CoverSource } from '../../../shared/settings'
import { isCoverHash } from '../../covers/cover-names'

export interface FetchedEntry {
  // the cover found; none for "not found"
  hash?: string
  source: CoverSource | 'none'
  // when it was looked up, ms
  at: number
  // searchKey of the names looked up; fixed tags make a new search
  key: string
}

// album id (or artist key) -> result
export type Fetched = Map<string, FetchedEntry>

// albums: covers; artists: photos, in the same file so they are kept and
// pruned the same way
export type FetchedSection = 'albums' | 'artists'

const version = 1
// a miss is looked up again after this long, since the services add albums
export const notFoundMs = 30 * 24 * 3600 * 1000

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseFetched(raw: unknown, section: FetchedSection = 'albums'): Fetched {
  const out: Fetched = new Map()
  if (!isObject(raw) || raw.version !== version || !isObject(raw[section])) return out
  for (const [id, v] of Object.entries(raw[section])) {
    if (!isObject(v) || typeof v.key !== 'string') continue
    if (typeof v.at !== 'number' || !Number.isFinite(v.at)) continue
    if (v.source === 'none') out.set(id, { source: 'none', at: v.at, key: v.key })
    else if (
      coverSources.includes(v.source as CoverSource) &&
      typeof v.hash === 'string' &&
      isCoverHash(v.hash)
    )
      out.set(id, { hash: v.hash, source: v.source as CoverSource, at: v.at, key: v.key })
  }
  return out
}

export function serializeFetched(albums: Fetched, artists: Fetched = new Map()): unknown {
  return { version, albums: Object.fromEntries(albums), artists: Object.fromEntries(artists) }
}

// Still good: the album's names are the ones looked up, and a found cover is
// in the cache, or a miss is younger than 30 days.
export function isFresh(
  e: FetchedEntry | undefined,
  key: string,
  now: number,
  hasCover: (hash: string) => boolean
): boolean {
  if (!e || e.key !== key) return false
  return e.hash ? hasCover(e.hash) : now - e.at < notFoundMs
}

export function fetchedCover(
  f: Fetched,
  albumId: string,
  key: string,
  hasCover: (hash: string) => boolean
): string | undefined {
  const e = f.get(albumId)
  return e?.hash && e.key === key && hasCover(e.hash) ? e.hash : undefined
}

// Found covers whose small file is gone (an older build pruned it, the cache
// was cleared) but whose downloaded picture is kept: made again from that
// picture, with no new download.
export function lostCovers(
  f: Fetched,
  known: (hash: string) => boolean,
  kept: (hash: string) => boolean
): string[] {
  const out = new Set<string>()
  for (const e of f.values()) if (e.hash && !known(e.hash) && kept(e.hash)) out.add(e.hash)
  return [...out]
}

// A manual Rescan, or a source turned on: every miss is looked up again.
export function dropNotFound(f: Fetched): boolean {
  let changed = false
  for (const [id, e] of f)
    if (!e.hash) {
      f.delete(id)
      changed = true
    }
  return changed
}

export function dropGone(f: Fetched, albumIds: Set<string>): boolean {
  let changed = false
  for (const id of f.keys())
    if (!albumIds.has(id)) {
      f.delete(id)
      changed = true
    }
  return changed
}
