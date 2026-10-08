// The Artists view (ticket 021): search, what Play plays and the covers for
// an artist's picture. No DOM. Who counts as an artist is in shared/plugins/files/artists.ts.
import { artistKey, namesOf, type Artist } from '../../../../shared/plugins/files/artists'
import type { ArtistCredit } from '../../../../shared/library'
import type { ArtistsShown } from '../../../../shared/settings'
import { foldedName, foldQuery } from '../../library/views'
import type { CoverArt } from '../types'

export function filterArtists(artists: Artist[], q: string): Artist[] {
  const s = foldQuery(q)
  return s ? artists.filter((a) => foldedName(a).includes(s)) : artists
}

// artists with an album of their own, after the names in artists.json
export const albumArtists = (artists: Artist[]): Artist[] =>
  artists.filter((a) => a.albums.length > 0)

// What the Artists grid shows (ticket 081). A search looks at every artist
// whatever the choice, so a guest on one song can still be found.
export function shownArtists(artists: Artist[], shown: ArtistsShown, q: string): Artist[] {
  if (foldQuery(q)) return filterArtists(artists, q)
  return shown === 'album' ? albumArtists(artists) : artists
}

// The artists of a song or album as links (ticket 040): one per name of a
// split credit (one you made), since each has its own page. key is
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

// Whether every song's credit is `name`, so a page about that artist (an
// album's, an artist's) can leave out the Artist column (ticket 075). A
// guest or a split credit keeps it.
export function allBy(songs: ArtistCredit[], name: string): boolean {
  const key = artistKey(name)
  return songs.every((t) => artistKey(t.artist) === key)
}

// Their albums in order, then their songs on other albums.
export function artistSongs(a: Artist, album: (id: string) => { trackIds: string[] }): string[] {
  return [...a.albums.flatMap((id) => album(id).trackIds), ...a.also]
}

// Up to 4 different covers for the picture made from covers: their albums
// first, then the pictures of their songs on other albums. With their colors,
// shown while the picture loads.
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
