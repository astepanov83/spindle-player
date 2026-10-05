// What Edit artist and "Use tag" send (tickets 024 and 069): tag key to the
// names to show, or null for the tag as its own name. The page makes the
// changes here and the library process checks them; artists-file.ts turns
// them into links in artists.json.
import { artistKey, type Artist } from './artists'

// tag key -> new names, or null to use the tag again
export type ArtistChanges = Record<string, string[] | null>

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
export const isKey = (k: string): boolean =>
  k.length > 0 && k.length <= maxNameLength && artistKey(k) === k

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
    // the tag as its own name, linked by you, so the AI leaves it alone
    out[t.key] = next.length === 1 && next[0] === t.name ? null : next
  }
  return out
}
