// The Artists view (ticket 021): search, what Play plays and the covers for
// an artist's picture. No DOM. Who counts as an artist is in shared/plugins/files/artists.ts.
import { artistKey, namesOf, type Artist } from '../../../../shared/plugins/files/artists'
import { commonGenre } from '../../../../shared/genre'
import type { ArtistCredit, SoundArt } from '../../../../shared/library'
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

// The genre most of their albums have, for the picture made for an artist
// with no cover (ticket 104).
export const artistGenre = (
  a: Artist,
  album: (id: string) => { genre?: string }
): string | undefined => commonGenre(a.albums.map(album))

// All the songs of an artist as one ring for the sound picture (ticket 107):
// their albums' songs, then their songs on other albums. No loudness at all
// (nothing read yet) gives none, so the picture is rings until some is in; a
// song not read yet has flat bars.
export function artistSound(
  a: Artist,
  album: (id: string) => SoundSource,
  track: (id: string) => { albumId: string; duration: number; art?: SoundSource }
): SoundArt {
  return soundOf(
    a.albums.map(album),
    a.also.map((id) => {
      const t = track(id)
      const al = album(t.albumId)
      const own = t.art?.loudness?.[0]
      return {
        length: Math.round(t.duration),
        loudness: own ?? al.loudness?.[al.trackIds?.indexOf(id) ?? -1]
      }
    })
  )
}

export interface SoundSource {
  lengths?: number[]
  loudness?: string[]
  trackIds?: string[]
}

// Albums' songs, then single songs, as one list of lengths and curves.
export function soundOf(
  albums: readonly SoundSource[],
  songs: readonly { length: number; loudness?: string }[] = []
): SoundArt {
  const lengths: number[] = []
  const loudness: string[] = []
  for (const al of albums)
    (al.lengths ?? []).forEach((l, i) => {
      lengths.push(l)
      loudness.push(al.loudness?.[i] ?? '')
    })
  for (const s of songs) {
    lengths.push(s.length)
    loudness.push(s.loudness ?? '')
  }
  return { lengths, ...(loudness.some(Boolean) ? { loudness } : {}) }
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
