// Who is an artist in the Artists view (ticket 021), from tags the scan
// already reads, after the artist overrides (ticket 024). The page lists them
// and the library process looks up their photos with the same list, so both
// use the same keys.
import type { Album, ArtistCredit, Track } from './library'

// A tag an artist comes from, spelled as it was first seen. names: what an
// override made of it; none when the tag is used as it is.
export interface ArtistTag {
  key: string
  name: string
  names?: string[]
}

export interface Artist {
  // the same for names that differ only by case or spacing
  key: string
  // the way the name is written most often
  name: string
  // their albums (Album.artist), in library order
  albums: string[]
  // their songs on other artists' albums, in library order
  also: string[]
  // the tags they come from: tags used as they are first, then by name
  tags: ArtistTag[]
}

// Names are kept as written: "A & B" and "A feat. B" are their own artists.
export function artistKey(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/\s+/g, '')
}

// the artists of an album or song
export const namesOf = (c: ArtistCredit): string[] => c.artists ?? [c.artist]
// the tag as written
export const tagOf = (c: ArtistCredit): string => c.artistTag ?? c.artist

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Every album artist ("Various Artists" and "Unknown artist" too), plus every
// song artist that differs from its album's, by name. A split credit gives
// each of its names.
export function listArtists(albums: Album[], track: (id: string) => Track): Artist[] {
  const byKey = new Map<
    string,
    { a: Artist; names: Map<string, number>; tags: Map<string, ArtistTag> }
  >()
  // a big library has 50k songs and far fewer names
  const keys = new Map<string, string>()
  const keyOf = (name: string): string => {
    let key = keys.get(name)
    if (key === undefined) keys.set(name, (key = artistKey(name)))
    return key
  }
  // one count per album and per song, for the name shown
  const credit = (name: string, c: ArtistCredit): Artist | undefined => {
    const key = keyOf(name)
    if (!key) return undefined
    let e = byKey.get(key)
    if (!e) {
      const a = { key, name, albums: [], also: [], tags: [] }
      byKey.set(key, (e = { a, names: new Map(), tags: new Map() }))
    }
    e.names.set(name, (e.names.get(name) ?? 0) + 1)
    const tag = tagOf(c)
    const tagKey = keyOf(tag)
    if (!e.tags.has(tagKey))
      e.tags.set(
        tagKey,
        c.artistTag === undefined
          ? { key: tagKey, name: tag }
          : { key: tagKey, name: tag, names: namesOf(c) }
      )
    return e.a
  }
  for (const al of albums) {
    const owners = new Set<Artist>()
    for (const n of namesOf(al)) {
      const a = credit(n, al)
      if (a && !owners.has(a)) {
        owners.add(a)
        a.albums.push(al.id)
      }
    }
    for (const id of al.trackIds) {
      const t = track(id)
      for (const n of namesOf(t)) {
        const a = credit(n, t)
        if (a && !owners.has(a) && a.also.at(-1) !== id) a.also.push(id)
      }
    }
  }
  const out: Artist[] = []
  for (const { a, names, tags } of byKey.values()) {
    let best = 0
    // the first one seen wins a tie
    for (const [name, n] of names)
      if (n > best) {
        best = n
        a.name = name
      }
    a.tags = [...tags.values()].sort(
      (x, y) => Number(!!x.names) - Number(!!y.names) || collator.compare(x.name, y.name)
    )
    out.push(a)
  }
  return out.sort((x, y) => collator.compare(x.name, y.name) || (x.key < y.key ? -1 : 1))
}
