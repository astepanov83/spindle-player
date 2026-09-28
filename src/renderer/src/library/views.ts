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
// No sort keeps the rows as they are (a playlist in its own order).
export function sortRows(rows: Track[], sort: Sort | null, order: (t: Track) => number): Track[] {
  if (!sort) return rows
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

// Playlists start in their own order. A third click on a column goes back to it.
export function nextPlaylistSort(sort: Sort | null, k: SortKey): Sort | null {
  if (!sort || sort.k !== k) return { k, dir: 1 }
  return sort.dir === 1 ? { k, dir: -1 } : null
}

// Each playlist's sort, by playlist id. One in its own order has no entry.
export type PlaylistSorts = Readonly<Record<string, Sort>>

export function withPlaylistSort(
  sorts: PlaylistSorts,
  id: string,
  sort: Sort | null
): PlaylistSorts {
  const next = { ...sorts }
  if (sort) next[id] = sort
  else delete next[id]
  return next
}

// A playlist's songs that are in the library. The others stay in the file
// (a rescan may find them again) but are not shown or played.
export function playlistRows(
  ids: string[],
  has: (id: string) => boolean,
  track: (id: string) => Track
): { rows: Track[]; missing: number } {
  const rows = ids.filter(has).map(track)
  return { rows, missing: ids.length - rows.length }
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

// How many rows the view must move so the first row on screen stays in its
// place when songs or albums come or go above it (a scan adds them, ticket 022).
// `first`: the first row on screen; `per`: items in a row (1 in a table). At
// the top it stays at the top, so new songs show. Items are matched by key.
// A list scrolled past its end moves by the rows it grew, so what is below
// it (a folder's songs under its subfolders) stays in place.
export function placeShift<T>(
  old: T[],
  next: T[],
  first: number,
  per: number,
  key: (item: T) => string
): number {
  if (first <= 0) return 0
  if (first * per >= old.length) return Math.ceil(next.length / per) - Math.ceil(old.length / per)
  const at = new Map<string, number>()
  next.forEach((x, i) => at.set(key(x), i))
  // the first item on screen, or the next that is still there
  const end = Math.min(old.length, (first + 20) * per)
  for (let i = first * per; i < end; i++) {
    const j = at.get(key(old[i]))
    if (j !== undefined) return Math.floor(j / per) - Math.floor(i / per)
  }
  return 0
}
