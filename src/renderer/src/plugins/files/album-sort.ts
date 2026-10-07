// The Albums grid's sort (ticket 085): a choice on its head, kept in
// settings (viewSorts.albums). No DOM.
import type { Album } from '../../../../shared/library'
import type { Play } from '../../../../shared/plays'

export type AlbumSort = 'name' | 'artist' | 'year' | 'added' | 'played' | 'plays'

// the key in settings.viewSorts
export const albumsView = 'albums'

// in the order the menu lists them
export const albumSorts: { id: AlbumSort; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'artist', label: 'Artist' },
  { id: 'year', label: 'Year' },
  { id: 'added', label: 'Recently added' },
  { id: 'played', label: 'Recently played' },
  { id: 'plays', label: 'Most played' }
]

// Artist is the library's own order (artist, year, title).
export function parseAlbumSort(v: string | undefined): AlbumSort {
  return albumSorts.find((s) => s.id === v)?.id ?? 'artist'
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Newest and most first; an album with nothing to sort by (no year, never
// played) goes after the rest. Ties keep library order.
export function sortAlbums(
  albums: Album[],
  by: AlbumSort,
  played: (al: Album) => Play | undefined
): Album[] {
  if (by === 'artist') return albums
  if (by === 'name')
    return byKey(
      albums,
      (al) => al.title,
      (a, b) => collator.compare(a, b)
    )
  if (by === 'year') return byNumber(albums, (al) => al.year)
  if (by === 'added') return byNumber(albums, (al) => al.added)
  // played is the same for both but asked once per album, not per compare
  const rows = albums.map((al) => ({ al, p: played(al) }))
  const last = (p: Play | undefined): number => p?.last ?? 0
  const n = (p: Play | undefined): number => p?.n ?? 0
  return byKey(
    rows,
    (r) => r.p,
    by === 'played' ? (a, b) => last(b) - last(a) : (a, b) => n(b) - n(a) || last(b) - last(a)
  ).map((r) => r.al)
}

// largest first; 0 means unknown and goes last
function byNumber(albums: Album[], key: (al: Album) => number): Album[] {
  return byKey(albums, key, (a, b) => (b || -1) - (a || -1))
}

// Each key is asked once; ties keep the order given.
function byKey<T, K>(items: T[], key: (x: T) => K, compare: (a: K, b: K) => number): T[] {
  const rows = items.map((x, i) => ({ x, i, k: key(x) }))
  rows.sort((a, b) => compare(a.k, b.k) || a.i - b.i)
  return rows.map((r) => r.x)
}
