// Playlists: a name and a list of items, saved in playlists.json in userData.
// Main checks the file; the page edits the list with the functions below.
// Version 2 holds item keys (ticket 055); main converts an older file once at
// start (main/convert-files.ts).
import { isKeyOfKind, type ItemKey } from './plugins/items'

export interface Playlist {
  id: string
  name: string
  // Songs that left the library stay here, so they come back after a rescan finds them.
  items: ItemKey[]
}

export const maxNameLength = 200

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Blank names get a default; long ones are cut.
export function cleanName(name: string, fallback = 'Playlist'): string {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, maxNameLength)
  return n || fallback
}

// The file may be hand-edited or half written. A bad playlist is dropped on
// its own; a bad item is dropped from its playlist, and so is a live one (a
// station): My stations keeps those.
export function parsePlaylists(raw: unknown): Playlist[] {
  const list = isObject(raw) && Array.isArray(raw.playlists) ? raw.playlists : []
  const out: Playlist[] = []
  const ids = new Set<string>()
  for (const p of list) {
    if (!isObject(p) || typeof p.id !== 'string' || !p.id || ids.has(p.id)) continue
    if (typeof p.name !== 'string') continue
    const items = Array.isArray(p.items) ? p.items.filter((t) => isKeyOfKind(t, 'track')) : []
    ids.add(p.id)
    out.push({ id: p.id, name: cleanName(p.name), items: [...new Set(items)] })
  }
  return out
}

// True when the next save would write the file back as it is. Anything else (a
// newer version, a playlist this version drops) is copied before it is replaced.
export function isKnownPlaylistsFile(raw: unknown): boolean {
  if (!isObject(raw) || raw.version !== 2 || !Array.isArray(raw.playlists)) return false
  const again = playlistsFile(parsePlaylists(raw))
  return (
    JSON.stringify(again) === JSON.stringify({ version: raw.version, playlists: raw.playlists })
  )
}

// What the file holds.
export function playlistsFile(list: Playlist[]): { version: 2; playlists: Playlist[] } {
  return { version: 2, playlists: list }
}

// "New playlist", then "New playlist 2", "New playlist 3"... The number
// always fits: a long name is cut before it.
export function newName(list: Playlist[], base = 'New playlist'): string {
  const taken = new Set(list.map((p) => p.name))
  const named = (n: number): string => {
    const end = n > 1 ? ` ${n}` : ''
    return base.slice(0, maxNameLength - end.length) + end
  }
  let n = 1
  while (taken.has(named(n))) n++
  return named(n)
}

// A name for a playlist made from songs: the album when they are all from
// one, else the first song's artist.
export function nameForSongs(songs: { albumId: string; album: string; artist: string }[]): string {
  const first = songs[0]
  if (!first) return 'New playlist'
  const album = songs.every((s) => s.albumId === first.albumId) ? cleanName(first.album, '') : ''
  return album || cleanName(first.artist, '') || 'New playlist'
}

export function create(
  list: Playlist[],
  id: string,
  name: string,
  items: ItemKey[] = []
): Playlist[] {
  return [...list, { id, name: cleanName(name), items: [...new Set(items)] }]
}

export function rename(list: Playlist[], id: string, name: string): Playlist[] {
  return list.map((p) => (p.id === id ? { ...p, name: cleanName(name, p.name) } : p))
}

export function remove(list: Playlist[], id: string): Playlist[] {
  return list.filter((p) => p.id !== id)
}

// Adds songs at the end. A song already in the playlist is not added again.
export function addItems(
  list: Playlist[],
  id: string,
  items: ItemKey[]
): { list: Playlist[]; added: number } {
  let added = 0
  const next = list.map((p) => {
    if (p.id !== id) return p
    const have = new Set(p.items)
    const fresh = [...new Set(items)].filter((t) => !have.has(t))
    added = fresh.length
    return fresh.length ? { ...p, items: [...p.items, ...fresh] } : p
  })
  return { list: added ? next : list, added }
}

export function removeItems(list: Playlist[], id: string, items: ItemKey[]): Playlist[] {
  const drop = new Set<string>(items)
  return list.map((p) => (p.id === id ? { ...p, items: p.items.filter((t) => !drop.has(t)) } : p))
}

// The songs removeItems took, each with its place, for Undo.
export function removedAt(list: Playlist[], id: string, items: ItemKey[]): Removed[] {
  const drop = new Set<string>(items)
  const p = list.find((x) => x.id === id)
  return p ? p.items.flatMap((key, at) => (drop.has(key) ? [{ key, at }] : [])) : []
}

export interface Removed {
  key: ItemKey
  at: number
}

// Undo of removeItems: each song back at its place (or the end, if the
// playlist got shorter since). One that is in it again is left where it is.
export function putBack(list: Playlist[], id: string, removed: Removed[]): Playlist[] {
  let changed = false
  const out = list.map((p) => {
    if (p.id !== id) return p
    const items = [...p.items]
    const have = new Set(items)
    for (const r of [...removed].sort((a, b) => a.at - b.at)) {
      if (have.has(r.key)) continue
      items.splice(Math.min(r.at, items.length), 0, r.key)
      have.add(r.key)
    }
    if (items.length === p.items.length) return p
    changed = true
    return { ...p, items }
  })
  return changed ? out : list
}
