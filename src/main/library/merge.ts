// The index in memory: reading it from disk, and folding scan results into it.
import { sep } from 'path'
import { indexVersion, type FileEntry, type FolderImage, type LibraryIndex } from './types'

export function emptyIndex(): LibraryIndex {
  return { version: indexVersion, files: new Map(), images: new Map() }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown): v is string => typeof v === 'string'

function parseEntry(v: unknown): FileEntry | undefined {
  if (!isObject(v) || !str(v.path) || !num(v.mtime) || !num(v.size)) return undefined
  const e: FileEntry = { path: v.path, mtime: v.mtime, size: v.size, duration: 0 }
  for (const k of [
    'title',
    'artist',
    'albumArtist',
    'album',
    'genre',
    'codec',
    'container',
    'cover',
    'error'
  ] as const)
    if (str(v[k]) && v[k]) e[k] = v[k]
  for (const k of ['track', 'disc', 'year'] as const) if (num(v[k]) && v[k] > 0) e[k] = v[k]
  if (num(v.duration) && v.duration > 0) e.duration = v.duration
  return e
}

function parseImage(v: unknown): FolderImage | undefined {
  if (!isObject(v) || !str(v.path) || !num(v.mtime) || !num(v.size) || !str(v.cover))
    return undefined
  return { path: v.path, mtime: v.mtime, size: v.size, cover: v.cover }
}

// A file from another version starts empty, so every file is read again.
export function parseIndex(raw: unknown): LibraryIndex {
  const ix = emptyIndex()
  if (!isObject(raw) || raw.version !== indexVersion) return ix
  if (Array.isArray(raw.files))
    for (const v of raw.files) {
      const e = parseEntry(v)
      if (e) ix.files.set(e.path, e)
    }
  if (Array.isArray(raw.images))
    for (const v of raw.images) {
      const im = parseImage(v)
      if (im) ix.images.set(dirOf(im.path), im)
    }
  return ix
}

export function serializeIndex(ix: LibraryIndex): unknown {
  return { version: ix.version, files: [...ix.files.values()], images: [...ix.images.values()] }
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf(sep)
  return i > 0 ? path.slice(0, i) : sep
}

export function isUnder(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep)
}

// The files a scan has to read: new ones, changed ones, and ones whose cover
// is gone from the cache. `known` is path -> [mtime, size, cover].
export function planReads(
  known: Map<string, [number, number, string]>,
  found: { path: string; mtime: number; size: number }[],
  cached: (hash: string) => boolean
): string[] {
  const out: string[] = []
  for (const f of found) {
    const k = known.get(f.path)
    if (!k || k[0] !== f.mtime || k[1] !== f.size || (k[2] && !cached(k[2]))) out.push(f.path)
  }
  return out
}

// Applies what the walk found. Files under a folder that could not be read are
// kept, so an unplugged drive doesn't empty the library. Returns true if anything changed.
export function applyListing(
  ix: LibraryIndex,
  folders: string[],
  listing: { paths: string[]; images: FolderImage[]; skipped: string[] }
): boolean {
  const present = new Set(listing.paths)
  const kept = (path: string): boolean =>
    folders.some((f) => isUnder(path, f)) &&
    (present.has(path) || listing.skipped.some((s) => isUnder(path, s)))
  let changed = false
  for (const path of ix.files.keys())
    if (!kept(path)) {
      ix.files.delete(path)
      changed = true
    }

  const images = new Map<string, FolderImage>()
  for (const [dir, im] of ix.images)
    if (folders.some((f) => isUnder(dir, f)) && listing.skipped.some((s) => isUnder(dir, s)))
      images.set(dir, im)
  for (const im of listing.images) images.set(dirOf(im.path), im)
  if (!sameImages(ix.images, images)) {
    ix.images = images
    changed = true
  }
  return changed
}

function sameImages(a: Map<string, FolderImage>, b: Map<string, FolderImage>): boolean {
  if (a.size !== b.size) return false
  for (const [dir, im] of a) {
    const o = b.get(dir)
    if (!o || o.path !== im.path || o.cover !== im.cover) return false
  }
  return true
}

// Adds or replaces files the worker read. Returns true if anything changed.
export function applyBatch(ix: LibraryIndex, entries: FileEntry[]): boolean {
  let changed = false
  for (const e of entries) {
    const old = ix.files.get(e.path)
    if (!old || JSON.stringify(old) !== JSON.stringify(e)) changed = true
    ix.files.set(e.path, e)
  }
  return changed
}

// Every cover hash the index points at, so the cache can drop the rest.
export function usedCovers(ix: LibraryIndex): Set<string> {
  const out = new Set<string>()
  for (const e of ix.files.values()) if (e.cover) out.add(e.cover)
  for (const im of ix.images.values()) if (im.cover) out.add(im.cover)
  return out
}
