// What an artist's page is made of (ticket 099): their most played songs,
// their releases in parts, and their songs on an album opened under them.
// Each artist page look draws these its own way. No DOM, no store.
import type { Artist } from '../../../../shared/plugins/files/artists'
import type { Album } from '../../../../shared/library'
import type { Play } from '../../../../shared/plays'
import { shortRelease } from '../../library/groups'
import { sortAlbums } from './album-sort'

// newest first, no year last, as the Year sort
export const newest = (albums: Album[]): Album[] => sortAlbums(albums, 'year', () => undefined)

// Their releases, newest first: albums, then singles and EPs, then the other
// artists' albums their songs are on. A part with nothing is empty.
export interface ArtistParts {
  albums: Album[]
  singles: Album[]
  appearsOn: Album[]
}

export function artistParts(
  a: Artist,
  album: (id: string) => Album,
  albumOf: (trackId: string) => string
): ArtistParts {
  const own = newest(a.albums.map(album))
  const on = [...new Set(a.also.map(albumOf))].map(album)
  return {
    albums: own.filter((al) => !shortRelease(al)),
    singles: own.filter(shortRelease),
    appearsOn: newest(on)
  }
}

// Their most played songs, most first; a tie goes to the one played last,
// then to the order given. Only songs played at least once.
export function topSongs<K>(songs: K[], of: (song: K) => Play | undefined, most = 5): K[] {
  return songs
    .map((k, i) => ({ k, i, p: of(k) }))
    .filter((x): x is { k: K; i: number; p: Play } => !!x.p && x.p.n > 0)
    .sort((x, y) => y.p.n - x.p.n || y.p.last - x.p.last || x.i - y.i)
    .slice(0, most)
    .map((x) => x.k)
}

// Their songs on an album opened under them, in album order, to mark among
// the others. None when that marks nothing: their own album (every song is
// theirs), or an album where all or none of the songs are theirs.
export function theirSongs(a: Artist, al: Album): string[] | undefined {
  if (a.albums.includes(al.id)) return undefined
  const also = new Set(a.also)
  const ids = al.trackIds.filter((id) => also.has(id))
  return ids.length && ids.length < al.trackIds.length ? ids : undefined
}
