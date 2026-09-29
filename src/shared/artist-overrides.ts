// Artist names changed by hand (ticket 024): a tag renamed, or split into
// several artists. Kept by artistKey of the tag in artist-overrides.json, so
// tags and library.json never change. The library process applies them when
// it groups albums. New names are not looked up again, so there are no chains.
import { artistKey, tagOf, type Artist } from './artists'
import type { ArtistCredit } from './library'

// tag key -> the names to show instead
export type ArtistOverrides = Map<string, string[]>
// What the page sends: tag key -> new names, or null to use the tag again.
export type ArtistChanges = Record<string, string[] | null>

const version = 1
export const maxNames = 20
export const maxNameLength = 200

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Trimmed, empty ones dropped, one per artist key (the first spelling wins).
export function cleanNames(names: unknown): string[] {
  if (!Array.isArray(names)) return []
  const out: string[] = []
  const keys = new Set<string>()
  for (const n of names) {
    if (typeof n !== 'string') continue
    const name = n.trim().slice(0, maxNameLength)
    const key = artistKey(name)
    if (!key || keys.has(key)) continue
    keys.add(key)
    out.push(name)
    if (out.length >= maxNames) break
  }
  return out
}

// A key as artistKey makes it, so a hand-made file can't hold two spellings of one.
const isKey = (k: string): boolean =>
  k.length > 0 && k.length <= maxNameLength && artistKey(k) === k

// A file this build can read.
export const knownOverrides = (raw: unknown): boolean =>
  isObject(raw) && raw.version === version && isObject(raw.artists)

export function parseOverrides(raw: unknown): ArtistOverrides {
  const out: ArtistOverrides = new Map()
  if (!knownOverrides(raw)) return out
  const artists = (raw as { artists: Record<string, unknown> }).artists
  for (const [k, v] of Object.entries(artists)) {
    const names = cleanNames(v)
    if (isKey(k) && names.length) out.set(k, names)
  }
  return out
}

export function serializeOverrides(o: ArtistOverrides): unknown {
  return { version, artists: Object.fromEntries(o) }
}

// The page's changes, checked: main can't trust what the page sends.
export function parseChanges(raw: unknown): ArtistChanges | undefined {
  if (!isObject(raw)) return undefined
  const out: ArtistChanges = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!isKey(k)) return undefined
    if (v === null) out[k] = null
    else {
      const names = cleanNames(v)
      if (!names.length) return undefined
      out[k] = names
    }
  }
  return Object.keys(out).length ? out : undefined
}

// True when something changed.
export function applyChanges(o: ArtistOverrides, c: ArtistChanges): boolean {
  let changed = false
  for (const [k, names] of Object.entries(c)) {
    const old = o.get(k)
    if (names === null) {
      changed = o.delete(k) || changed
    } else if (!old || old.length !== names.length || old.some((n, i) => n !== names[i])) {
      o.set(k, names)
      changed = true
    }
  }
  return changed
}

// Drops overrides of tags no album or song has any more. Only after a scan
// that ran to the end: a folder that could not be read keeps its songs.
export function dropUnused(o: ArtistOverrides, used: Set<string>): boolean {
  let changed = false
  for (const k of o.keys())
    if (!used.has(k)) {
      o.delete(k)
      changed = true
    }
  return changed
}

// What an artist tag is shown as.
export function creditOf(tag: string, o: ArtistOverrides): ArtistCredit {
  const names = o.size ? o.get(artistKey(tag)) : undefined
  if (!names) return { artist: tag }
  const c: ArtistCredit = { artist: names.join(', '), artistTag: tag }
  if (names.length > 1) c.artists = names
  return c
}

// The keys of every artist tag in the library, for dropUnused.
export function tagKeys(credits: Iterable<ArtistCredit>): Set<string> {
  const out = new Set<string>()
  for (const c of credits) out.add(artistKey(tagOf(c)))
  return out
}

// The changes for the artist page's editor: one name renames, several split.
// Every tag the artist comes from gets them. A tag that was split already
// has only this artist's name swapped, so the other names stay.
export function editArtist(a: Artist, names: string[]): ArtistChanges {
  const clean = cleanNames(names)
  const out: ArtistChanges = {}
  if (!clean.length) return out
  for (const t of a.tags) {
    if (!t.names) {
      // the tag as it is: nothing to save
      if (clean.length === 1 && clean[0] === t.name) continue
      out[t.key] = clean
      continue
    }
    const next = cleanNames(t.names.flatMap((n) => (artistKey(n) === a.key ? clean : [n])))
    out[t.key] = next.length === 1 && next[0] === t.name ? null : next
  }
  return out
}
