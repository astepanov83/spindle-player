// Search, sort and grid math for the library views. No DOM.
import type { Album, Track } from '../../../shared/library'

export type SortKey = 't' | 'a' | 'al' | 'd'
export interface Sort {
  k: SortKey
  dir: 1 | -1
}

const norm = (q: string): string => q.trim().toLowerCase()

export function albumMatches(album: Album, q: string): boolean {
  const s = norm(q)
  return !s || (album.title + ' ' + album.artist).toLowerCase().includes(s)
}

export function filterAlbums(albums: Album[], q: string): Album[] {
  return norm(q) ? albums.filter((a) => albumMatches(a, q)) : albums
}

// The Songs table: every song of a matching album, plus songs whose title matches.
export function songRows(albums: Album[], track: (id: string) => Track, q: string): Track[] {
  const s = norm(q)
  const out: Track[] = []
  for (const al of albums) {
    const whole = albumMatches(al, q)
    for (const id of al.trackIds) {
      const t = track(id)
      if (whole || t.title.toLowerCase().includes(s)) out.push(t)
    }
  }
  return out
}

const keyOf: Record<SortKey, (t: Track) => string | number> = {
  t: (t) => t.title,
  a: (t) => t.artist,
  al: (t) => t.album,
  d: (t) => t.duration
}

// Ties keep library order (album, then track number), as in the prototype.
export function sortRows(rows: Track[], sort: Sort, order: (t: Track) => number): Track[] {
  const key = keyOf[sort.k]
  return [...rows].sort((x, y) => {
    const u = key(x)
    const v = key(y)
    return (u > v ? 1 : u < v ? -1 : 0) * sort.dir || order(x) - order(y)
  })
}

// Clicking the sorted column again reverses it.
export function nextSort(sort: Sort, k: SortKey): Sort {
  return sort.k === k ? { k, dir: sort.dir === 1 ? -1 : 1 } : { k, dir: 1 }
}

// Columns in the cover grid: tiles of at least `min` px with `gap` between them.
export function gridColumns(width: number, min = 140, gap = 16): number {
  return Math.max(1, Math.floor((width + gap) / (min + gap)))
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
