// Each song's loudness over time (ticket 106), for the "sound" picture of an
// album with no cover. ffmpeg decodes a file once, mono at a low rate
// (loudness-read.ts); here the samples become 32 values per song, which are
// kept in loudness.json and sent with the albums. Plain TS, so it is tested.
import type { LibraryData } from '../../../shared/library'

// values per song
export const points = 32
// The dB range the values cover. Fixed, not per album, so a quiet album
// looks quiet next to a loud one: a loud master is about -9 dB, quiet
// classical about -30.
export const floorDb = -48
export const topDb = -6
// Energy is summed per window of this length; a song is cut at window edges.
export const windowsPerSecond = 50

// Squared samples summed per window of 16-bit mono PCM, as ffmpeg sends it.
export class Energy {
  readonly perWindow: number
  #sums: number[] = []
  #sum = 0
  #inWindow = 0
  // a byte of a sample split between two pieces of output
  #odd: number | undefined

  constructor(readonly rate: number) {
    this.perWindow = Math.max(1, Math.round(rate / windowsPerSecond))
  }

  add(b: Uint8Array): void {
    let i = 0
    if (this.#odd !== undefined && b.length) {
      this.#sample(sample(this.#odd, b[0]))
      this.#odd = undefined
      i = 1
    }
    for (; i + 1 < b.length; i += 2) this.#sample(sample(b[i], b[i + 1]))
    if (i < b.length) this.#odd = b[i]
  }

  #sample(s: number): void {
    this.#sum += s * s
    if (++this.#inWindow === this.perWindow) {
      this.#sums.push(this.#sum)
      this.#sum = 0
      this.#inWindow = 0
    }
  }

  // The sums per window, and how many samples the last one has.
  finish(): Windows {
    const sums = [...this.#sums]
    let last = this.perWindow
    if (this.#inWindow) {
      sums.push(this.#sum)
      last = this.#inWindow
    }
    return { sums, perWindow: this.perWindow, last }
  }
}

// little-endian signed 16-bit, as a share of full scale
function sample(lo: number, hi: number): number {
  const v = lo | (hi << 8)
  return (v >= 0x8000 ? v - 0x10000 : v) / 0x8000
}

export interface Windows {
  sums: number[]
  perWindow: number
  // samples in the last window
  last: number
}

// A song's stretch of its file, in seconds; no end: to the end of the file.
export interface Cut {
  start: number
  end?: number
}

// One byte per value: 0 is floorDb or quieter, 255 is topDb or louder.
export function levelOf(meanSquare: number): number {
  if (!(meanSquare > 0)) return 0
  const db = 10 * Math.log10(meanSquare)
  const v = (db - floorDb) / (topDb - floorDb)
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}

// RMS over `points` equal slices of the windows from..to. A song shorter
// than `points` windows repeats a window rather than leave a slice empty.
export function curveOf(w: Windows, from: number, to: number): Uint8Array {
  const out = new Uint8Array(points)
  const n = w.sums.length
  if (!n) return out
  from = Math.min(Math.max(0, from), n - 1)
  to = Math.min(Math.max(from + 1, to), n)
  const count = (i: number): number => (i === n - 1 ? w.last : w.perWindow)
  for (let k = 0; k < points; k++) {
    const a = from + Math.floor(((to - from) * k) / points)
    const b = Math.max(a + 1, from + Math.floor(((to - from) * (k + 1)) / points))
    let sum = 0
    let samples = 0
    for (let i = a; i < b; i++) {
      sum += w.sums[i]
      samples += count(i)
    }
    out[k] = levelOf(sum / samples)
  }
  return out
}

// A curve for each song of a file, by its start and end. A whole file is one
// cut from 0.
export function splitCurves(w: Windows, cuts: Cut[]): Uint8Array[] {
  const at = (s: number): number => Math.round(s * windowsPerSecond)
  return cuts.map((c) => curveOf(w, at(c.start), c.end === undefined ? w.sums.length : at(c.end)))
}

// The page's values: 0-1 in steps of 0.01, plenty for a picture and short in JSON.
export const valuesOf = (curve: Uint8Array): number[] =>
  Array.from(curve, (b) => Math.round((b / 255) * 100) / 100)

// --- loudness.json ---

// What was read of one file. No curves: ffmpeg could not decode it, so it is
// not tried again until the file changes.
export interface LoudEntry {
  size: number
  mtime: number
  // cutsKey of the songs the curves are for; '' for the whole file
  cuts: string
  curves?: Uint8Array[]
}

// file path -> what was read
export type LoudStore = Map<string, LoudEntry>

const version = 1

// '' for a file that is one song, else each cut's start and end
export function cutsKey(cuts: Cut[]): string {
  if (cuts.length === 1 && cuts[0].start === 0 && cuts[0].end === undefined) return ''
  return cuts.map((c) => `${c.start}-${c.end ?? ''}`).join(' ')
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

export function parseLoudness(raw: unknown): LoudStore {
  const out: LoudStore = new Map()
  if (!isObject(raw) || raw.version !== version || !isObject(raw.files)) return out
  for (const [path, v] of Object.entries(raw.files)) {
    if (!isObject(v) || !isCount(v.size) || !isCount(v.mtime)) continue
    const e: LoudEntry = {
      size: v.size,
      mtime: v.mtime,
      cuts: typeof v.cuts === 'string' ? v.cuts : ''
    }
    if (Array.isArray(v.curves)) {
      const curves = v.curves.map((c) =>
        typeof c === 'string' ? new Uint8Array(Buffer.from(c, 'base64')) : undefined
      )
      // a broken entry is read again
      if (!curves.length || curves.some((c) => c?.length !== points)) continue
      e.curves = curves as Uint8Array[]
    }
    out.set(path, e)
  }
  return out
}

// base64: 44 characters for a song's 32 bytes
export function serializeLoudness(store: LoudStore): unknown {
  const files: Record<string, unknown> = {}
  for (const [path, e] of store) {
    const v: Record<string, unknown> = { size: e.size, mtime: e.mtime }
    if (e.cuts) v.cuts = e.cuts
    if (e.curves) v.curves = e.curves.map((c) => Buffer.from(c).toString('base64'))
    files[path] = v
  }
  return { version, files }
}

// A file to read, as the library has it now.
export interface LoudFile {
  path: string
  size: number
  mtime: number
  // seconds, 0 when unknown
  duration: number
  // its songs in time order
  cuts: Cut[]
  key: string
}

// Read already: the same size and time, and for a file split by a cue sheet,
// the same cuts. A file that could not be decoded is not tried again for new cuts.
export function isFresh(e: LoudEntry | undefined, f: LoudFile): boolean {
  return !!e && e.size === f.size && e.mtime === f.mtime && (!e.curves || e.cuts === f.key)
}

// Drops files the index no longer has or that changed (a moved file has a
// new path). True when something went.
export function pruneLoudness(
  store: LoudStore,
  fileOf: (path: string) => { size: number; mtime: number } | undefined
): boolean {
  let gone = false
  for (const [path, e] of store) {
    const f = fileOf(path)
    if (f && f.size === e.size && f.mtime === e.mtime) continue
    store.delete(path)
    gone = true
  }
  return gone
}

// The files to read, in the order to read them, and where each song's curve is.
export interface LoudPlan {
  files: LoudFile[]
  // track id -> its file and its cut's place in it
  songs: Map<string, { path: string; i: number }>
  // songs each file has
  counts: Map<string, number>
}

// Albums with no cover come first: theirs are the pictures that show.
export function loudPlan(
  data: LibraryData,
  pathOf: (fileId: string) => string | undefined,
  fileOf: (path: string) => { size: number; mtime: number; duration: number } | undefined
): LoudPlan {
  const byPath = new Map<string, { file: LoudFile; ids: { id: string; cut: Cut }[] }>()
  const track = new Map(data.tracks.map((t) => [t.id, t]))
  const albums = [...data.albums.filter((a) => !a.cover), ...data.albums.filter((a) => a.cover)]
  for (const al of albums)
    for (const id of al.trackIds) {
      const t = track.get(id)
      const path = t && pathOf(t.part?.file ?? t.id)
      const f = path && fileOf(path)
      if (!t || !path || !f) continue
      let p = byPath.get(path)
      if (!p) {
        const file = { path, size: f.size, mtime: f.mtime, duration: f.duration, cuts: [], key: '' }
        byPath.set(path, (p = { file, ids: [] }))
      }
      const cut: Cut = t.part ? { start: t.part.start } : { start: 0 }
      if (t.part?.end !== undefined) cut.end = t.part.end
      p.ids.push({ id, cut })
    }
  const files: LoudFile[] = []
  const songs = new Map<string, { path: string; i: number }>()
  const counts = new Map<string, number>()
  for (const { file, ids } of byPath.values()) {
    ids.sort((a, b) => a.cut.start - b.cut.start)
    file.cuts = ids.map((x) => x.cut)
    file.key = cutsKey(file.cuts)
    ids.forEach((x, i) => songs.set(x.id, { path: file.path, i }))
    counts.set(file.path, ids.length)
    files.push(file)
  }
  return { files, songs, counts }
}

// Songs done (read, or could not be read) of all songs in the plan.
export function loudCounts(plan: LoudPlan, store: LoudStore): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const f of plan.files) {
    const n = plan.counts.get(f.path) ?? 0
    total += n
    if (isFresh(store.get(f.path), f)) done += n
  }
  return { done, total }
}

// Puts the curves on the albums, and on loose songs' own pictures. An album
// gets them once every song is read (one that could not be read has []), so
// the picture doesn't change while its songs come in. `cache` keeps the
// page's values of each curve, so a build makes no new arrays.
export function addLoudness(
  data: LibraryData,
  plan: LoudPlan,
  store: LoudStore,
  cache: WeakMap<Uint8Array, number[]>
): void {
  const byPath = new Map(plan.files.map((f) => [f.path, f]))
  const curveOf = (id: string): number[] | undefined => {
    const s = plan.songs.get(id)
    const f = s && byPath.get(s.path)
    const e = f && store.get(f.path)
    if (!s || !f || !isFresh(e, f)) return undefined
    const c = e!.curves?.[s.i]
    if (!c) return []
    let v = cache.get(c)
    if (!v) cache.set(c, (v = valuesOf(c)))
    return v
  }
  for (const al of data.albums) {
    const all = al.trackIds.map(curveOf)
    if (all.every((c) => c) && all.some((c) => c!.length)) al.loudness = all as number[][]
  }
  for (const t of data.tracks) {
    if (!t.art?.seed) continue
    const c = curveOf(t.id)
    if (c?.length) t.art.loudness = [c]
  }
}
