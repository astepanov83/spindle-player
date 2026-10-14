// The Genres view (ticket 123): every genre of the library with its albums
// and the songs of other albums that carry it. No DOM, no store. The genre
// rules (splitting, one spelling) are in shared/genres.ts.
import { genreKey } from '../../../../shared/genres'
import type { Album, Track } from '../../../../shared/library'
import { foldedName, foldQuery } from '../../library/views'

export interface Genre {
  // genreKey of the name: "hiphop/rap"
  key: string
  // the spelling most songs use
  name: string
  // the albums whose songs mostly carry it, in library order
  albums: string[]
  // its songs on the other albums, in library order
  also: string[]
  // what its Play plays: the albums' songs and `also`
  songs: number
}

// An album is in a genre when at least half of its songs carry it, so a
// compilation with one rap song is not a rap album; that song is listed
// on its own.
const isAlbumGenre = (carry: number, songs: number): boolean => carry * 2 >= songs

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// The library's genres, A-Z. Songs with no genre are in none.
export function listGenres(albums: readonly Album[], track: (id: string) => Track): Genre[] {
  const byKey = new Map<string, Genre>()
  // each key's spellings and how many songs use each
  const spellings = new Map<string, Map<string, number>>()
  for (const al of albums) {
    // this album's songs for each key, in song order
    const here = new Map<string, string[]>()
    for (const id of al.trackIds) {
      const t = track(id)
      if (!t.genre) continue
      const seen = new Set<string>()
      for (const g of t.genre) {
        const k = genreKey(g)
        if (!k || seen.has(k)) continue
        seen.add(k)
        let names = spellings.get(k)
        if (!names) spellings.set(k, (names = new Map()))
        names.set(g, (names.get(g) ?? 0) + 1)
        const ids = here.get(k)
        if (ids) ids.push(id)
        else here.set(k, [id])
      }
    }
    for (const [k, ids] of here) {
      let genre = byKey.get(k)
      if (!genre) byKey.set(k, (genre = { key: k, name: '', albums: [], also: [], songs: 0 }))
      if (isAlbumGenre(ids.length, al.trackIds.length)) {
        genre.albums.push(al.id)
        genre.songs += al.trackIds.length
      } else {
        genre.also.push(...ids)
        genre.songs += ids.length
      }
    }
  }
  for (const [k, genre] of byKey) genre.name = mostUsed(spellings.get(k)!)
  return [...byKey.values()].sort(byName)
}

// the first one on a tie
function mostUsed(names: Map<string, number>): string {
  let best = ''
  let bestN = 0
  for (const [name, n] of names)
    if (n > bestN) {
      best = name
      bestN = n
    }
  return best
}

const byName = (a: Genre, b: Genre): number =>
  collator.compare(a.name, b.name) || (a.key < b.key ? -1 : 1)

// The Genres view's sorts: A-Z, or the biggest first.
export const genreSorts = [
  { id: 'name', label: 'A-Z' },
  { id: 'size', label: 'Most songs' }
] as const
export type GenreSort = (typeof genreSorts)[number]['id']

export const parseGenreSort = (v: string | undefined): GenreSort => (v === 'size' ? 'size' : 'name')

// `genres` come A-Z (listGenres).
export function sortGenres(genres: Genre[], by: GenreSort): Genre[] {
  if (by === 'name') return genres
  return [...genres].sort(
    (a, b) => b.songs - a.songs || b.albums.length - a.albums.length || byName(a, b)
  )
}

export function filterGenres(genres: Genre[], q: string): Genre[] {
  const s = foldQuery(q)
  return s ? genres.filter((g) => foldedName(g).includes(s)) : genres
}
