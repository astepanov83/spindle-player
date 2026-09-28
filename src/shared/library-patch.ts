// The library the page gets while a scan runs: only what changed since the
// last one sent (ticket 022). A 50k library is about 10 MB of JSON, and the
// page would parse all of it and redo every lookup each few seconds.
// The library process makes the patch, the page applies it; main passes the
// bytes on without reading them.
import type { Album, LibraryData, Track } from './library'

// Which library the page has. `epoch` is new each time the library process
// starts, and `n` counts the libraries it sent since.
export interface LibraryVersion {
  epoch: string
  n: number
}

export type FullLibrary = LibraryData & LibraryVersion

export interface PatchBody {
  // new and changed albums, whole
  albums: Album[]
  // every album id in library order, when albums came, went or moved
  order?: string[]
  // new and changed songs
  tracks: Track[]
  // songs that left the library
  goneTracks: string[]
}

export type LibraryPatch = PatchBody & { patch: true; epoch: string; from: number; n: number }

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
  const oldTracks = new Map(old.tracks.map((t) => [t.id, t]))
  const tracks: Track[] = []
  for (const t of next.tracks) {
    const o = oldTracks.get(t.id)
    oldTracks.delete(t.id)
    if (!o || !same(o, t)) tracks.push(t)
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
  if (!tracks.length && !goneTracks.length && !albums.length && !moved) return undefined
  const out: PatchBody = { albums, tracks, goneTracks }
  if (moved) out.order = next.albums.map((a) => a.id)
  return out
}

// Applies a patch: `tracks` is changed in place, and the album list comes
// back (the same list when no album changed). Throws when the patch doesn't
// fit, before anything changed, so the caller can ask for the whole library.
export function applyPatch(albums: Album[], tracks: Map<string, Track>, p: PatchBody): Album[] {
  const out = patchAlbums(albums, p)
  for (const id of p.goneTracks) tracks.delete(id)
  for (const t of p.tracks) tracks.set(t.id, t)
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
