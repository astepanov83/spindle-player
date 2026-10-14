// Search, sort and grid math for the library views. No DOM.
import { songYear, type Album, type Track } from '../../../shared/library'
import type { Play } from '../../../shared/plays'
import type { ItemKey } from '../../../shared/plugins/items'
import type { ItemInfo } from '../plugins/types'
import {
  fold,
  hasQuery,
  hasText,
  parseQuery,
  songTest,
  type Query,
  type SongFields,
  type TextField
} from './search-query'

export { fold }

// title, artist, album, time; plays and last played (ticket 085); genre
// and year (ticket 122)
export type SortKey = 't' | 'a' | 'al' | 'd' | 'p' | 'lp' | 'g' | 'y'
export interface Sort {
  k: SortKey
  dir: 1 | -1
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

// each field apart, for search by field (ticket 128)
const trackText: Record<TextField, (t: Track) => string> = {
  title: foldedBy((t: Track) => t.title),
  artist: foldedBy((t: Track) => t.artist),
  album: songAlbum,
  genre: foldedBy((t: Track) => t.genre?.join('\n') ?? ''),
  codec: foldedBy((t: Track) => t.codec)
}

// What a field search reads of a library song beyond the song itself: the
// files plugin gives its stores (plugins/files/query.ts).
export interface TrackLookups {
  album?(t: Track): Album | undefined
  played?(t: Track): Play | undefined
  loved?(t: Track): boolean
}

export function trackFields(look: TrackLookups = {}): SongFields<Track> {
  return {
    text: (t, f) => trackText[f](t),
    num(t, f) {
      if (f === 'year') return songYear(t, look.album?.(t))
      if (f === 'added') return look.album?.(t)?.added
      const p = look.played?.(t)
      return f === 'plays' ? (p?.n ?? 0) : p?.last
    },
    loved: (t) => look.loved?.(t) ?? false
  }
}

// The query's song test, or null when it has no fields.
function fieldTest<T>(q: Query, of: SongFields<T>): ((t: T) => boolean) | null {
  return q.terms.length ? songTest(q.terms, of) : null
}

// A song, with its album too: Folders and playlists match that way.
export const songOrAlbumHas = (t: Track, q: Query): boolean => hasText(q, songText(t), songAlbum(t))

export const foldQuery = (q: string): string => fold(q.trim())

// A song by its own title or artist, and its fields. Not by its album: the
// search results have a group for albums.
export function songMatches(t: Track, q: string, of = trackFields()): boolean {
  const p = parseQuery(q)
  return hasText(p, songText(t)) && (fieldTest(p, of)?.(t) ?? true)
}

// By title or album artist; by field when one of its songs has it (an album
// matches year:1994 by its songs' year).
export function filterAlbums(
  albums: Album[],
  q: string,
  track?: (id: string) => Track,
  of = trackFields()
): Album[] {
  const p = parseQuery(q)
  if (!hasQuery(p)) return albums
  const song = fieldTest(p, of)
  return albums.filter(
    (a) =>
      hasText(p, albumText(a)) && (!song || (!!track && a.trackIds.some((id) => song(track(id)))))
  )
}

// The Songs table: every song of a matching album, plus songs whose title
// or artist matches; with fields, only the songs that have them.
export function songRows(
  albums: Album[],
  track: (id: string) => Track,
  q: string,
  of = trackFields()
): Track[] {
  const p = parseQuery(q)
  const song = fieldTest(p, of)
  const out: Track[] = []
  for (const al of albums)
    for (const id of al.trackIds) {
      const t = track(id)
      if (hasText(p, albumText(al), songText(t)) && (!song || song(t))) out.push(t)
    }
  return out
}

// The search results' songs, in library order. None for an empty search.
export function searchSongs(
  albums: Album[],
  track: (id: string) => Track,
  q: string,
  of = trackFields()
): Track[] {
  const p = parseQuery(q)
  if (!hasQuery(p)) return []
  const song = fieldTest(p, of)
  const out: Track[] = []
  for (const al of albums)
    for (const id of al.trackIds) {
      const t = track(id)
      if (hasText(p, songText(t)) && (!song || song(t))) out.push(t)
    }
  return out
}

// A playlist's rows by title, artist or album, as in Folders.
export function filterSongs(rows: Track[], q: string, of = trackFields()): Track[] {
  const p = parseQuery(q)
  if (!hasQuery(p)) return rows
  const song = fieldTest(p, of)
  return rows.filter((t) => songOrAlbumHas(t, p) && (!song || song(t)))
}

export function filterPlaylists<T extends { name: string }>(list: T[], q: string): T[] {
  const s = foldQuery(q)
  // a few names: not worth keeping folded
  return s ? list.filter((p) => fold(p.name).includes(s)) : list
}

// A song's genres as one line: "Rock, Metal".
export const genreText = (t: Pick<Track, 'genre'>): string => t.genre?.join(', ') ?? ''

// undefined: nothing to sort by, which comes last both ways
type Field = string | number | undefined

const keyOf: Record<SortKey, (t: Track, year: (t: Track) => number) => Field> = {
  t: (t) => t.title,
  a: (t) => t.artist,
  al: (t) => t.album,
  d: (t) => t.duration,
  // only Classic's Songs shows these, and it sorts items (sortItems)
  p: () => 0,
  lp: () => 0,
  g: (t) => genreText(t) || undefined,
  y: (t, year) => year(t) || undefined
}

// Up or down by `dir`; a song with no genre or year after the rest, as an
// album with no year in the Albums grid's Year sort.
function compare(u: Field, v: Field, dir: 1 | -1): number {
  if (u === undefined || v === undefined) return u === v ? 0 : u === undefined ? 1 : -1
  return (u > v ? 1 : u < v ? -1 : 0) * dir
}

// Ties keep library order (album, then track number), as in the prototype.
// No sort keeps the rows as they are (a playlist in its own order). `year`:
// a song's year, its album's when it has none of its own (songYear).
export function sortRows(
  rows: Track[],
  sort: Sort | null,
  order: (t: Track) => number,
  year: (t: Track) => number = (t) => t.year ?? 0
): Track[] {
  if (!sort) return rows
  const key = keyOf[sort.k]
  return [...rows].sort(
    (x, y) => compare(key(x, year), key(y, year), sort.dir) || order(x) - order(y)
  )
}

// Plays and Last played start with the most and the latest.
const firstDir = (k: SortKey): 1 | -1 => (k === 'p' || k === 'lp' ? -1 : 1)

// Clicking the sorted column again reverses it.
export function nextSort(sort: Sort, k: SortKey): Sort {
  return sort.k === k ? { k, dir: sort.dir === 1 ? -1 : 1 } : { k, dir: firstDir(k) }
}

// Playlists start in their own order. A third click on a column goes back to it.
export function nextPlaylistSort(sort: Sort | null, k: SortKey): Sort | null {
  if (!sort || sort.k !== k) return { k, dir: firstDir(k) }
  return sort.dir === firstDir(k) ? { k, dir: -sort.dir as 1 | -1 } : null
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

const itemTextOf: Record<TextField, (i: ItemInfo) => string> = {
  title: foldedBy((i: ItemInfo) => i.title),
  artist: foldedBy((i: ItemInfo) => i.subtitle ?? ''),
  album: foldedBy((i: ItemInfo) => i.group ?? ''),
  // "Rock, Metal": a value with a comma in it can't be told apart, but a
  // search for a part of one still finds it
  genre: foldedBy((i: ItemInfo) => i.genre ?? ''),
  codec: foldedBy((i: ItemInfo) => i.codec ?? '')
}

// How a field search reads an item of a playlist or smart list: what its
// plugin says, and the core's plays and hearts.
export function itemFields(
  info: InfoOf,
  played: PlayOf,
  loved: (key: ItemKey) => boolean
): SongFields<ItemKey> {
  return {
    text(k, f) {
      const i = info(k)
      return i ? itemTextOf[f](i) : ''
    },
    num(k, f) {
      if (f === 'year') return info(k)?.year
      if (f === 'added') return info(k)?.added
      const p = played(k)
      return f === 'plays' ? (p?.n ?? 0) : p?.last
    },
    loved
  }
}

// A playlist's rows by title, artist or album, as in Folders, and by field
// with `of`.
export function filterItems(
  keys: ItemKey[],
  q: string,
  info: InfoOf,
  of?: SongFields<ItemKey>
): ItemKey[] {
  const p = parseQuery(q)
  if (!hasQuery(p)) return keys
  const song = of ? fieldTest(p, of) : null
  return keys.filter((k) => {
    const i = info(k)
    return !!i && hasText(p, itemText(i)) && (!song || song(k))
  })
}

type PlayOf = (key: ItemKey) => Play | undefined

const itemField: Record<SortKey, (key: ItemKey, info: InfoOf, played: PlayOf) => Field> = {
  t: (k, info) => info(k)?.title ?? '',
  a: (k, info) => info(k)?.subtitle ?? '',
  al: (k, info) => info(k)?.group ?? '',
  d: (k, info) => info(k)?.length ?? 0,
  p: (k, _, played) => played(k)?.n ?? 0,
  lp: (k, _, played) => played(k)?.last ?? 0,
  g: (k, info) => info(k)?.genre || undefined,
  y: (k, info) => info(k)?.year || undefined
}

// Ties keep the order given (library order in the library's lists). Each
// item is asked once, not in every compare: a list can hold 50k songs.
// `played` is asked only for a sort by plays, so a play counted doesn't
// sort the other tables again.
export function sortItems(
  keys: ItemKey[],
  sort: Sort | null,
  info: InfoOf,
  played: PlayOf = () => undefined
): ItemKey[] {
  if (!sort) return keys
  const field = itemField[sort.k]
  const rows = keys.map((key, i) => ({ key, i, v: field(key, info, played) }))
  rows.sort((x, y) => compare(x.v, y.v, sort.dir) || x.i - y.i)
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

// Where the items of a list are, in px from its top. Rows of different
// heights (a grid with headings, ticket 096) count by items too, so a scan
// that adds some above still holds the screen.
export interface ItemPlaces {
  // the top of item i's row
  top(i: number): number
  // the first item of the row at y px; under a heading, the item below it
  at(y: number): number
  // the whole list
  height: number
}

// n items, `per` to a row, rows of `size` px.
export function evenPlaces(n: number, per: number, size: number): ItemPlaces {
  return {
    top: (i) => Math.floor(i / per) * size,
    at: (y) => Math.max(0, Math.floor(y / size)) * per,
    height: Math.ceil(n / per) * size
  }
}

// How far the view must move, in px, so the item at index `from` stays in
// its place when songs or albums come or go above it (a scan adds them,
// ticket 022), with the places before and after the change. Items are matched
// by key. In a grid, songs that come above move the items a column or two,
// so the next change holds the same item again (see keep-place.svelte.ts); a
// row's first item each time would lose those columns and drift up. A list
// scrolled past its end moves by what it grew, so what is below it (a
// folder's songs under its subfolders) stays in place.
export function heldMove<T>(
  old: T[],
  next: T[],
  from: number,
  per: number,
  key: (item: T) => string,
  before: ItemPlaces,
  after: ItemPlaces
): { px: number; held?: string } {
  if (from >= old.length) return { px: after.height - before.height }
  const at = new Map<string, number>()
  next.forEach((x, i) => at.set(key(x), i))
  // the item, or the next that is still there
  const end = Math.min(old.length, from + 20 * per)
  for (let i = from; i < end; i++) {
    const k = key(old[i])
    const j = at.get(k)
    if (j !== undefined) return { px: after.top(j) - before.top(i), held: k }
  }
  return { px: 0 }
}
