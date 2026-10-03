// Search, sort and grid math for the library views. No DOM.
import type { Album, Track } from '../../../shared/library'
import type { ItemKey } from '../../../shared/plugins/items'
import type { ItemInfo } from '../plugins/types'

export type SortKey = 't' | 'a' | 'al' | 'd'
export interface Sort {
  k: SortKey
  dir: 1 | -1
}

// For search: lower case, and letters without their accents, so "bjork"
// finds Björk and "cafe" Café. Only the accents of U+0300-U+036F go: the
// Japanese voicing marks (が) are other marks and stay. Cyrillic й and ё
// lose theirs too, so и and е find them.
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
}

// The search text of each song, album and artist, folded once: folding 50k
// songs on every key is slow. Kept by object, which the library replaces
// when a song, album or artist changes (a scan's patch, an artist edit) and
// never edits, so an entry can't go stale; a dropped object takes its entry.
function foldedBy<T extends object>(text: (x: T) => string): (x: T) => string {
  const kept = new WeakMap<T, string>()
  return (x) => {
    let f = kept.get(x)
    if (f === undefined) kept.set(x, (f = fold(text(x))))
    return f
  }
}

// title and artist; the album apart, since the results don't match songs by it
const songText = foldedBy((t: Track) => t.title + '\n' + t.artist)
const songAlbum = foldedBy((t: Track) => t.album)
const albumText = foldedBy((a: Album) => a.title + ' ' + a.artist)
// an artist's or a folder's name
export const foldedName = foldedBy((x: { name: string }) => x.name)

// A song, with its album too: Folders and playlists match that way.
// `s` is folded (foldQuery).
export const songOrAlbumHas = (t: Track, s: string): boolean =>
  songText(t).includes(s) || songAlbum(t).includes(s)

export const foldQuery = (q: string): string => fold(q.trim())

// A song by its own title or artist. Not by its album: the search results
// have a group for albums.
export function songMatches(t: Track, q: string): boolean {
  const s = foldQuery(q)
  return !s || songText(t).includes(s)
}

export function filterAlbums(albums: Album[], q: string): Album[] {
  const s = foldQuery(q)
  return s ? albums.filter((a) => albumText(a).includes(s)) : albums
}

// The Songs table: every song of a matching album, plus songs whose title
// or artist matches.
export function songRows(albums: Album[], track: (id: string) => Track, q: string): Track[] {
  const s = foldQuery(q)
  const out: Track[] = []
  for (const al of albums) {
    const whole = !s || albumText(al).includes(s)
    for (const id of al.trackIds) {
      const t = track(id)
      if (whole || songText(t).includes(s)) out.push(t)
    }
  }
  return out
}

// The search results' songs, in library order. None for an empty search.
export function searchSongs(albums: Album[], track: (id: string) => Track, q: string): Track[] {
  const s = foldQuery(q)
  if (!s) return []
  const out: Track[] = []
  for (const al of albums)
    for (const id of al.trackIds) {
      const t = track(id)
      if (songText(t).includes(s)) out.push(t)
    }
  return out
}

// A playlist's rows by title, artist or album, as in Folders.
export function filterSongs(rows: Track[], q: string): Track[] {
  const s = foldQuery(q)
  return s ? rows.filter((t) => songOrAlbumHas(t, s)) : rows
}

export function filterPlaylists<T extends { name: string }>(list: T[], q: string): T[] {
  const s = foldQuery(q)
  // a few names: not worth keeping folded
  return s ? list.filter((p) => fold(p.name).includes(s)) : list
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

// A playlist's songs that are not gone. Gone ones stay in the file (a rescan
// may find them again) but are not shown or played. Songs whose plugin is off
// or still loading are shown, greyed.
export function playlistRows(
  keys: ItemKey[],
  gone: (key: ItemKey) => boolean
): { rows: ItemKey[]; missing: number } {
  const rows = keys.filter((k) => !gone(k))
  return { rows, missing: keys.length - rows.length }
}

// Items by what their plugin says, for the songs table (ticket 056). `info`
// is undefined for one that can't be drawn as itself (off, loading).
type InfoOf = (key: ItemKey) => ItemInfo | undefined

const itemText = foldedBy((i: ItemInfo) => `${i.title}\n${i.subtitle ?? ''}\n${i.group ?? ''}`)

// A playlist's rows by title, artist or album, as in Folders.
export function filterItems(keys: ItemKey[], q: string, info: InfoOf): ItemKey[] {
  const s = foldQuery(q)
  if (!s) return keys
  return keys.filter((k) => {
    const i = info(k)
    return !!i && itemText(i).includes(s)
  })
}

const itemField: Record<SortKey, (i: ItemInfo | undefined) => string | number> = {
  t: (i) => i?.title ?? '',
  a: (i) => i?.subtitle ?? '',
  al: (i) => i?.group ?? '',
  d: (i) => i?.length ?? 0
}

// Ties keep the order given (library order in the library's lists). Each
// item is asked once, not in every compare: a list can hold 50k songs.
export function sortItems(keys: ItemKey[], sort: Sort | null, info: InfoOf): ItemKey[] {
  if (!sort) return keys
  const field = itemField[sort.k]
  const rows = keys.map((key, i) => ({ key, i, v: field(info(key)) }))
  rows.sort((x, y) => (x.v > y.v ? 1 : x.v < y.v ? -1 : 0) * sort.dir || x.i - y.i)
  return rows.map((r) => r.key)
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
  return first <= 0 ? 0 : heldShift(old, next, first * per, per, key).rows
}

// placeShift from an item, not a row: `from` is the index of the item to hold
// in place. In a grid, songs that come above move the items a column or two,
// so the next change holds the same item again (see keep-place.svelte.ts); a
// row's first item each time would lose those columns and drift up.
// Returns the rows to move and the item held.
export function heldShift<T>(
  old: T[],
  next: T[],
  from: number,
  per: number,
  key: (item: T) => string
): { rows: number; held?: string } {
  if (from >= old.length)
    return { rows: Math.ceil(next.length / per) - Math.ceil(old.length / per) }
  const at = new Map<string, number>()
  next.forEach((x, i) => at.set(key(x), i))
  // the item, or the next that is still there
  const end = Math.min(old.length, from + 20 * per)
  for (let i = from; i < end; i++) {
    const k = key(old[i])
    const j = at.get(k)
    if (j !== undefined) return { rows: Math.floor(j / per) - Math.floor(i / per), held: k }
  }
  return { rows: 0 }
}
