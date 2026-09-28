// The index in memory: reading it from disk, and folding scan results into it.
import { sep } from 'path'
import { paletteVersion, parseThemePalettes } from '../../shared/palette'
import type { CueSheet, CueTrack } from './cue'
import {
  indexVersion,
  type CueEntry,
  type FileEntry,
  type FolderImage,
  type LibraryIndex
} from './types'

// Reader 1 until a scan with ffprobe has run: a first scan without it must not
// mark its entries as read by the newer reader.
export function emptyIndex(): LibraryIndex {
  return {
    version: indexVersion,
    reader: 1,
    files: new Map(),
    cues: new Map(),
    images: new Map(),
    palettes: new Map()
  }
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
  for (const k of ['track', 'disc', 'year', 'sampleRate', 'channels', 'bits'] as const)
    if (num(v[k]) && v[k] > 0) e[k] = v[k]
  if (num(v.duration) && v.duration > 0) e.duration = v.duration
  return e
}

function parseCueTrack(v: unknown, files: number): CueTrack | undefined {
  if (!isObject(v) || !num(v.no) || !num(v.file) || !num(v.start)) return undefined
  if (v.file < 0 || v.file >= files || v.start < 0) return undefined
  const t: CueTrack = { no: v.no, file: v.file, start: v.start }
  if (str(v.title)) t.title = v.title
  if (str(v.performer)) t.performer = v.performer
  return t
}

function parseCueSheet(v: unknown): CueSheet | undefined {
  if (!isObject(v) || !Array.isArray(v.files) || !Array.isArray(v.tracks)) return undefined
  if (!v.files.every(str)) return undefined
  const files = v.files as string[]
  const tracks = v.tracks.map((t) => parseCueTrack(t, files.length))
  if (!tracks.length || tracks.some((t) => !t)) return undefined
  const sheet: CueSheet = { files, tracks: tracks as CueTrack[] }
  for (const k of ['title', 'performer', 'genre'] as const) if (str(v[k])) sheet[k] = v[k]
  for (const k of ['year', 'disc'] as const) if (num(v[k])) sheet[k] = v[k]
  return sheet
}

function parseCueEntry(v: unknown): CueEntry | undefined {
  if (!isObject(v) || !str(v.path) || !num(v.mtime) || !num(v.size)) return undefined
  const c: CueEntry = { path: v.path, mtime: v.mtime, size: v.size }
  const sheet = parseCueSheet(v.sheet)
  if (sheet) c.sheet = sheet
  return c
}

function parseImage(v: unknown): FolderImage | undefined {
  if (!isObject(v) || !str(v.path) || !num(v.mtime) || !num(v.size) || !str(v.cover))
    return undefined
  return { path: v.path, mtime: v.mtime, size: v.size, cover: v.cover }
}

// A file from another version starts empty, so every file is read again.
// Palettes from another palette version are dropped; they are made again from
// the cached small covers, without reading any music file.
export function parseIndex(raw: unknown): LibraryIndex {
  const ix = emptyIndex()
  if (!isObject(raw) || raw.version !== indexVersion) return ix
  // an index from before the reader number was kept
  ix.reader = num(raw.reader) ? raw.reader : 1
  if (Array.isArray(raw.cues))
    for (const v of raw.cues) {
      const c = parseCueEntry(v)
      if (c) ix.cues.set(c.path, c)
    }
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
  if (raw.paletteVersion === paletteVersion && isObject(raw.palettes))
    for (const [hash, v] of Object.entries(raw.palettes)) {
      const p = parseThemePalettes(v)
      if (p && /^[0-9a-f]{40}$/.test(hash)) ix.palettes.set(hash, p)
    }
  return ix
}

export function serializeIndex(ix: LibraryIndex): unknown {
  return {
    version: ix.version,
    reader: ix.reader,
    files: [...ix.files.values()],
    cues: [...ix.cues.values()],
    images: [...ix.images.values()],
    paletteVersion,
    palettes: Object.fromEntries(ix.palettes)
  }
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf(sep)
  return i > 0 ? path.slice(0, i) : sep
}

export function isUnder(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep)
}

// The files a scan has to read: new ones, changed ones, and ones whose cover
// is gone from the cache. Files that failed last time only on a manual Rescan
// (a fixed permission doesn't change mtime): a start-up scan that reads them
// every time can cost minutes on a NAS. `again` picks more entries to read
// again, for a newer tag reader.
export function planReads(
  known: Map<string, FileEntry>,
  found: { path: string; mtime: number; size: number }[],
  cached: (hash: string) => boolean,
  retryFailed: boolean,
  again: (e: FileEntry) => boolean = () => false
): string[] {
  const out: string[] = []
  for (const f of found) {
    const k = known.get(f.path)
    if (
      !k ||
      k.mtime !== f.mtime ||
      k.size !== f.size ||
      (retryFailed && k.error !== undefined) ||
      (k.cover && !cached(k.cover)) ||
      again(k)
    )
      out.push(f.path)
  }
  return out
}

// Entries the tag reader before ffprobe (reader 1) got wrong: files it could
// not read, and old Monkey's Audio files it gave only a length.
export function readAgainWithProbe(e: FileEntry): boolean {
  return e.error !== undefined || (e.container === "Monkey's Audio" && !e.title)
}

// The cue sheets a scan has to read: new and changed ones, and on a manual
// Rescan ones that gave no sheet (a fixed permission doesn't change mtime).
export function planCueReads(
  known: Map<string, CueEntry>,
  found: { path: string; mtime: number; size: number }[],
  retryFailed = false
): { path: string; mtime: number; size: number }[] {
  return found.filter((f) => {
    const k = known.get(f.path)
    return !k || k.mtime !== f.mtime || k.size !== f.size || (retryFailed && !k.sheet)
  })
}

// Music folders that listed no files this time but have songs in the index.
// An unmounted drive often leaves an empty mount point, which reads fine but
// empty, so it counts as a folder that can't be read and keeps its songs.
export function emptiedFolders(ix: LibraryIndex, folders: string[], paths: string[]): string[] {
  return folders.filter(
    (f) => !paths.some((p) => isUnder(p, f)) && [...ix.files.keys()].some((p) => isUnder(p, f))
  )
}

// Applies what the walk found. Files under a folder that could not be read are
// kept, so an unplugged drive doesn't empty the library. Returns true if anything changed.
export function applyListing(
  ix: LibraryIndex,
  folders: string[],
  listing: { paths: string[]; cues?: string[]; images: FolderImage[]; skipped: string[] }
): boolean {
  const present = new Set([...listing.paths, ...(listing.cues ?? [])])
  const kept = (path: string): boolean =>
    folders.some((f) => isUnder(path, f)) &&
    (present.has(path) || listing.skipped.some((s) => isUnder(path, s)))
  let changed = false
  for (const map of [ix.files, ix.cues])
    for (const path of map.keys())
      if (!kept(path)) {
        map.delete(path)
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

// Adds or replaces a cue sheet. Returns true if it changed.
export function applyCue(ix: LibraryIndex, c: CueEntry): boolean {
  const old = ix.cues.get(c.path)
  ix.cues.set(c.path, c)
  return !old || JSON.stringify(old) !== JSON.stringify(c)
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

// Drops palettes of covers nothing points at. Returns true if any went.
export function prunePalettes(ix: LibraryIndex, used: Set<string>): boolean {
  let changed = false
  for (const hash of ix.palettes.keys())
    if (!used.has(hash)) {
      ix.palettes.delete(hash)
      changed = true
    }
  return changed
}

// Covers in the cache that have no palette yet, e.g. from an index made before 009.
export function missingPalettes(ix: LibraryIndex, cached: (hash: string) => boolean): string[] {
  return [...usedCovers(ix)].filter((h) => cached(h) && !ix.palettes.has(h))
}
