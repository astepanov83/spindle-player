// Playlists: a name and a list of track ids, saved in playlists.json in userData.
// Main checks the file; the page edits the list with the functions below.

export interface Playlist {
  id: string
  name: string
  // Songs that left the library stay here, so they come back after a rescan finds them.
  trackIds: string[]
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

// The file may be old, hand-edited or half written. A bad playlist is dropped
// on its own; a bad track id is dropped from its playlist.
export function parsePlaylists(raw: unknown): Playlist[] {
  const list = isObject(raw) && Array.isArray(raw.playlists) ? raw.playlists : []
  const out: Playlist[] = []
  const ids = new Set<string>()
  for (const p of list) {
    if (!isObject(p) || typeof p.id !== 'string' || !p.id || ids.has(p.id)) continue
    if (typeof p.name !== 'string') continue
    const trackIds = Array.isArray(p.trackIds)
      ? p.trackIds.filter((t): t is string => typeof t === 'string' && t.length > 0)
      : []
    ids.add(p.id)
    out.push({ id: p.id, name: cleanName(p.name), trackIds: [...new Set(trackIds)] })
  }
  return out
}

// True when the next save would write the file back as it is. Anything else (a
// newer version, a playlist this version drops) is copied before it is replaced.
export function isKnownPlaylistsFile(raw: unknown): boolean {
  if (!isObject(raw) || raw.version !== 1 || !Array.isArray(raw.playlists)) return false
  const again = playlistsFile(parsePlaylists(raw))
  return (
    JSON.stringify(again) === JSON.stringify({ version: raw.version, playlists: raw.playlists })
  )
}

// What the file holds.
export function playlistsFile(list: Playlist[]): { version: 1; playlists: Playlist[] } {
  return { version: 1, playlists: list }
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
  trackIds: string[] = []
): Playlist[] {
  return [...list, { id, name: cleanName(name), trackIds: [...new Set(trackIds)] }]
}

export function rename(list: Playlist[], id: string, name: string): Playlist[] {
  return list.map((p) => (p.id === id ? { ...p, name: cleanName(name, p.name) } : p))
}

export function remove(list: Playlist[], id: string): Playlist[] {
  return list.filter((p) => p.id !== id)
}

// Adds songs at the end. A song already in the playlist is not added again.
export function addTracks(
  list: Playlist[],
  id: string,
  trackIds: string[]
): { list: Playlist[]; added: number } {
  let added = 0
  const next = list.map((p) => {
    if (p.id !== id) return p
    const have = new Set(p.trackIds)
    const fresh = [...new Set(trackIds)].filter((t) => !have.has(t))
    added = fresh.length
    return fresh.length ? { ...p, trackIds: [...p.trackIds, ...fresh] } : p
  })
  return { list: added ? next : list, added }
}

export function removeTracks(list: Playlist[], id: string, trackIds: string[]): Playlist[] {
  const drop = new Set(trackIds)
  return list.map((p) =>
    p.id === id ? { ...p, trackIds: p.trackIds.filter((t) => !drop.has(t)) } : p
  )
}
