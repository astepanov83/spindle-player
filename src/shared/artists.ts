// Who is an artist in the Artists view (ticket 021), from tags the scan
// already reads. The page lists them and the library process looks up their
// photos with the same list, so both use the same keys.
import type { Album, Track } from './library'

export interface Artist {
  // the same for names that differ only by case or spacing
  key: string
  // the way the name is written most often
  name: string
  // their albums (Album.artist), in library order
  albums: string[]
  // their songs on other artists' albums, in library order
  also: string[]
}

// Names are kept as written: "A & B" and "A feat. B" are their own artists.
export function artistKey(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/\s+/g, '')
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Every album artist ("Various Artists" and "Unknown artist" too), plus every
// song artist that differs from its album's, by name.
export function listArtists(albums: Album[], track: (id: string) => Track): Artist[] {
  const byKey = new Map<string, { a: Artist; names: Map<string, number> }>()
  // a big library has 50k songs and far fewer names
  const keys = new Map<string, string>()
  // one count per album and per song, for the name shown
  const credit = (name: string): Artist | undefined => {
    let key = keys.get(name)
    if (key === undefined) keys.set(name, (key = artistKey(name)))
    if (!key) return undefined
    let e = byKey.get(key)
    if (!e) byKey.set(key, (e = { a: { key, name, albums: [], also: [] }, names: new Map() }))
    e.names.set(name, (e.names.get(name) ?? 0) + 1)
    return e.a
  }
  for (const al of albums) {
    const own = credit(al.artist)
    own?.albums.push(al.id)
    for (const id of al.trackIds) {
      const t = track(id)
      const a = credit(t.artist)
      if (a && a !== own) a.also.push(id)
    }
  }
  const out: Artist[] = []
  for (const { a, names } of byKey.values()) {
    let best = 0
    // the first one seen wins a tie
    for (const [name, n] of names)
      if (n > best) {
        best = n
        a.name = name
      }
    out.push(a)
  }
  return out.sort((x, y) => collator.compare(x.name, y.name) || (x.key < y.key ? -1 : 1))
}
