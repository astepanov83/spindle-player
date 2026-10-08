// The library the page gets while a scan runs: only what changed since the
// last one sent (ticket 022). A 50k library is about 10 MB of JSON, and the
// page would parse all of it and redo every lookup each few seconds.
// The library process makes the patch, the page applies it; main passes the
// bytes on without reading them.
import type { Album, ArtistPhoto, Folder, LibraryData, Track } from '../../library'

// Which library the page has. `epoch` is new each time the library process
// starts, and `n` counts the libraries it sent since.
export interface LibraryVersion {
  epoch: string
  n: number
}

// `partial`: the index was empty when the library process started (no
// library.json yet) and no scan has ended since, so a song not in it may still
// come: the page counts none as gone until a library comes without it.
export type FullLibrary = LibraryData & LibraryVersion & { partial?: true }

export interface PatchBody {
  // new and changed albums, whole
  albums: Album[]
  // every album id in library order, when albums came, went or moved
  order?: string[]
  // new and changed songs
  tracks: Track[]
  // songs that left the library
  goneTracks: string[]
  // The whole folder table, when it changed, and where each old folder went
  // (-1: gone). A folder that comes mid-scan is put in name order, so the
  // folders after it move up one: the page renumbers the songs it has, and
  // only songs that changed otherwise are sent.
  folders?: Folder[]
  folderMoves?: number[]
  // artist photos found or changed, and artists whose photo went (by artist key)
  photos?: Record<string, ArtistPhoto>
  gonePhotos?: string[]
}

export type LibraryPatch = PatchBody & {
  patch: true
  epoch: string
  from: number
  n: number
  partial?: true
}

// What main sends the page as UTF-8 JSON bytes.
export type LibraryMessage = FullLibrary | LibraryPatch

// Deep equality for JSON values, with no strings made (the library is compared
// every few seconds while a scan runs).
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false
    return true
  }
  if (Array.isArray(b)) return false
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  const keys = Object.keys(x)
  if (keys.length !== Object.keys(y).length) return false
  for (const k of keys) if (!Object.hasOwn(y, k) || !same(x[k], y[k])) return false
  return true
}

// What changed from `old` to `next`, or nothing.
export function diffLibrary(old: LibraryData, next: LibraryData): PatchBody | undefined {
  const moves = same(old.folders, next.folders) ? undefined : folderMoves(old.folders, next.folders)
  const oldTracks = new Map(old.tracks.map((t) => [t.id, t]))
  const tracks: Track[] = []
  for (const t of next.tracks) {
    const o = oldTracks.get(t.id)
    oldTracks.delete(t.id)
    if (!o || !sameTrack(o, t, moves)) tracks.push(t)
  }
  const goneTracks = [...oldTracks.keys()]

  const oldAlbums = new Map(old.albums.map((a) => [a.id, a]))
  const albums: Album[] = []
  let moved = old.albums.length !== next.albums.length
  next.albums.forEach((a, i) => {
    const o = oldAlbums.get(a.id)
    if (!o || !same(o, a)) albums.push(a)
    if (old.albums[i]?.id !== a.id) moved = true
  })

  const oldPhotos = old.artistPhotos ?? {}
  const nextPhotos = next.artistPhotos ?? {}
  const photos: Record<string, ArtistPhoto> = {}
  for (const [k, p] of Object.entries(nextPhotos))
    if (!Object.hasOwn(oldPhotos, k) || !same(oldPhotos[k], p)) photos[k] = p
  const gonePhotos = Object.keys(oldPhotos).filter((k) => !Object.hasOwn(nextPhotos, k))
  const newPhotos = Object.keys(photos).length > 0

  if (
    !tracks.length &&
    !goneTracks.length &&
    !albums.length &&
    !moved &&
    !moves &&
    !newPhotos &&
    !gonePhotos.length
  )
    return undefined
  const out: PatchBody = { albums, tracks, goneTracks }
  if (moved) out.order = next.albums.map((a) => a.id)
  if (moves) {
    out.folders = next.folders
    out.folderMoves = moves
  }
  if (newPhotos) out.photos = photos
  if (gonePhotos.length) out.gonePhotos = gonePhotos
  return out
}

// A folder is the same one when its path from the music folder is, so the
// key is the names from the top down.
function folderKeys(folders: Folder[]): string[] {
  const keys: string[] = []
  for (const f of folders) keys.push(f.parent < 0 ? f.name : keys[f.parent] + '\0' + f.name)
  return keys
}

// Where each folder of `old` is in `next`, -1 when it is gone.
function folderMoves(old: Folder[], next: Folder[]): number[] {
  const at = new Map(folderKeys(next).map((k, i) => [k, i]))
  return folderKeys(old).map((k) => at.get(k) ?? -1)
}

// The same song, once its folder is renumbered.
function sameTrack(o: Track, t: Track, moves: number[] | undefined): boolean {
  if (!moves) return same(o, t)
  if ((o.folder < 0 ? o.folder : (moves[o.folder] ?? -1)) !== t.folder) return false
  const x = o as unknown as Record<string, unknown>
  const y = t as unknown as Record<string, unknown>
  const keys = Object.keys(x)
  if (keys.length !== Object.keys(y).length) return false
  for (const k of keys)
    if (k !== 'folder' && (!Object.hasOwn(y, k) || !same(x[k], y[k]))) return false
  return true
}

// What the page keeps of a library, besides its songs by id.
export interface HeldLibrary {
  albums: Album[]
  folders: Folder[]
  photos: Record<string, ArtistPhoto>
}

// Applies a patch: `tracks` is changed in place, and the rest comes back
// (the same albums list, folders or photos when they did not change). Throws
// when the patch doesn't fit, before anything changed, so the caller can ask
// for the whole library.
export function applyPatch(
  have: HeldLibrary,
  tracks: Map<string, Track>,
  p: PatchBody
): HeldLibrary {
  const albums = patchAlbums(have.albums, p)
  const renumbered = p.folderMoves ? renumber(tracks, p) : []
  for (const id of p.goneTracks) tracks.delete(id)
  for (const t of renumbered) tracks.set(t.id, t)
  for (const t of p.tracks) tracks.set(t.id, t)
  return { albums, folders: p.folders ?? have.folders, photos: patchPhotos(have.photos, p) }
}

// Songs whose folder moved in the new table, as new objects. Songs the patch
// sends or drops are left out.
function renumber(tracks: Map<string, Track>, p: PatchBody): Track[] {
  const moves = p.folderMoves!
  const sent = new Set([...p.goneTracks, ...p.tracks.map((t) => t.id)])
  const out: Track[] = []
  for (const t of tracks.values()) {
    if (sent.has(t.id)) continue
    const to = moves[t.folder] ?? -1
    if (to < 0) throw new Error(`the library patch drops the folder of song ${t.id}`)
    if (to !== t.folder) out.push({ ...t, folder: to })
  }
  return out
}

function patchPhotos(
  photos: Record<string, ArtistPhoto>,
  p: PatchBody
): Record<string, ArtistPhoto> {
  if (!p.photos && !p.gonePhotos) return photos
  const out = { ...photos, ...p.photos }
  for (const k of p.gonePhotos ?? []) delete out[k]
  return out
}

function patchAlbums(albums: Album[], p: PatchBody): Album[] {
  if (!p.albums.length && !p.order) return albums
  const changed = new Map(p.albums.map((a) => [a.id, a]))
  if (!p.order) return albums.map((a) => changed.get(a.id) ?? a)
  const byId = new Map(albums.map((a) => [a.id, a]))
  return p.order.map((id) => {
    const a = changed.get(id) ?? byId.get(id)
    if (!a) throw new Error(`the library patch has an unknown album ${id}`)
    return a
  })
}

// What the page does with a library from main. A patch fits only the library
// it was made from; one the page already has is skipped, and a gap (a missed
// patch, or a new library process) means asking for the whole library.
export function patchStep(
  have: LibraryVersion | undefined,
  m: LibraryMessage
): 'apply' | 'skip' | 'fetch' {
  const ours = have?.epoch === m.epoch
  if (!('patch' in m)) return ours && m.n < have!.n ? 'skip' : 'apply'
  if (!ours) return 'fetch'
  if (m.from === have!.n) return 'apply'
  return m.n <= have!.n ? 'skip' : 'fetch'
}
