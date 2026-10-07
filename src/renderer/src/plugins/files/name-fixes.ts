// The name fixes (ticket 074): every tag whose shown name a link in
// artists.json changed, from the artists the page lists, so the list is what
// the library shows now (an AI link while Fix artist names is off is not).
// Also what "Keep separate" sends for a tag, and its Undo. No DOM.
import type { ArtistChanges } from '../../../../shared/plugins/files/artist-edit'
import type { Artist, ArtistTag } from '../../../../shared/plugins/files/artists'

// A tag and the artists it shows as now.
export interface NameFix {
  key: string
  // as written in the music files
  tag: string
  names: string[]
  // the AI's links made it, none of yours
  byAi: boolean
}

export interface NameFixes {
  // the AI split a joint credit into its artists
  split: NameFix[]
  // the AI showed a spelling under another artist's name
  joined: NameFix[]
  // renamed, split or joined by you in Edit
  yours: NameFix[]
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// A split tag is listed under each of its artists: one row per tag key.
// Joins are in the order of the artist they go to, so the spellings of one
// artist sit together.
export function nameFixes(artists: Artist[]): NameFixes {
  const seen = new Map<string, NameFix>()
  for (const a of artists)
    for (const t of a.tags)
      if (t.names && !seen.has(t.key))
        seen.set(t.key, { key: t.key, tag: t.name, names: t.names, byAi: !!t.grouped })
  const out: NameFixes = { split: [], joined: [], yours: [] }
  for (const f of seen.values())
    if (!f.byAi) out.yours.push(f)
    else if (f.names.length > 1) out.split.push(f)
    else out.joined.push(f)
  const byTag = (x: NameFix, y: NameFix): number => collator.compare(x.tag, y.tag)
  out.split.sort(byTag)
  out.yours.sort(byTag)
  out.joined.sort((x, y) => collator.compare(x.names[0], y.names[0]) || byTag(x, y))
  return out
}

export const fixCount = (f: NameFixes): number => f.split.length + f.joined.length + f.yours.length

// What a tag's note on the artist page says about its link.
export function tagNote(t: ArtistTag): string {
  if (!t.names) return ''
  const what = t.names.length > 1 ? 'split' : t.grouped ? 'joined' : 'renamed'
  return ` (${what}${t.grouped ? ' by AI' : ''})`
}

// "Keep separate": the tag as its own name, linked by you, so the AI leaves
// it alone. Undo puts the link back as it was, the AI's as the AI's.
export function keepSeparate(t: {
  key: string
  names?: string[]
  grouped?: true
}): { keep: ArtistChanges; undo: ArtistChanges } | undefined {
  if (!t.names) return undefined
  return {
    keep: { [t.key]: null },
    undo: { [t.key]: t.grouped ? { ai: t.names } : t.names }
  }
}
