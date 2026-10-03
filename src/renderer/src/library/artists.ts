// The Artists view (ticket 021): search, what Play plays and the covers for
// an artist's picture. No DOM. Who counts as an artist is in shared/artists.ts.
import { artistKey, namesOf, type Artist } from '../../../shared/artists'
import type { Art, ArtistCredit, Track } from '../../../shared/library'
import { foldedName, foldQuery, sortRows, type Sort } from './views'

export function filterArtists(artists: Artist[], q: string): Artist[] {
  const s = foldQuery(q)
  return s ? artists.filter((a) => foldedName(a).includes(s)) : artists
}

// The artists of a song or album as links (ticket 040): one per name of a
// split credit (an artist override), since each has its own page. key is
// null for a name with no page.
export function artistLinks(
  c: ArtistCredit,
  has: (key: string) => boolean
): { name: string; key: string | null }[] {
  return namesOf(c).map((name) => {
    const key = artistKey(name)
    return { name, key: has(key) ? key : null }
  })
}

// Their albums in order, then their songs on other albums.
export function artistSongs(a: Artist, album: (id: string) => { trackIds: string[] }): string[] {
  return [...a.albums.flatMap((id) => album(id).trackIds), ...a.also]
}

// What Play plays on the artist page: what it shows. Their albums in order,
// then the "Also on" songs in the table's sort.
export function artistPageSongs(
  a: Artist,
  album: (id: string) => { trackIds: string[] },
  track: (id: string) => Track,
  sort: Sort | null,
  order: (t: Track) => number
): string[] {
  const also = sortRows(a.also.map(track), sort, order).map((t) => t.id)
  return [...a.albums.flatMap((id) => album(id).trackIds), ...also]
}

// Up to 4 different covers for the picture made from covers: their albums
// first, then the pictures of their songs on other albums. With their colors,
// shown while the picture loads.
export type CoverArt = Pick<Art, 'cover' | 'palette'>

export function artistCovers(
  a: Artist,
  album: (id: string) => CoverArt,
  songArt: (trackId: string) => CoverArt
): CoverArt[] {
  const out: CoverArt[] = []
  const add = (art: CoverArt): boolean => {
    if (art.cover && !out.some((o) => o.cover === art.cover)) out.push(art)
    return out.length >= 4
  }
  for (const id of a.albums) if (add(album(id))) return out
  for (const id of a.also) if (add(songArt(id))) return out
  return out
}
