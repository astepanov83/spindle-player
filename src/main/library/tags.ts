// Turns what music-metadata reads into a clean FileEntry, plus the file name rules.
// Plain functions, so they are tested without real files.
import type { FileEntry } from './types'

// The part of music-metadata's result we use.
export interface RawTags {
  common: {
    title?: string
    artist?: string
    artists?: string[]
    albumartist?: string
    album?: string
    track?: { no: number | null }
    disk?: { no: number | null }
    year?: number
    date?: string
    genre?: string[]
  }
  format: {
    duration?: number
    codec?: string
    container?: string
    sampleRate?: number
    numberOfChannels?: number
    bitsPerSample?: number
  }
}

// Trims, joins runs of spaces and drops the NUL padding some ID3 tags have.
export function cleanText(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined
  const t = s.replaceAll(String.fromCharCode(0), ' ').replace(/\s+/g, ' ').trim()
  return t || undefined
}

function positive(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined
}

function yearOf(year: unknown, date: unknown): number | undefined {
  const y =
    positive(year) ?? (typeof date === 'string' ? Number(/^\s*(\d{4})/.exec(date)?.[1]) : NaN)
  return typeof y === 'number' && y >= 1000 && y <= 9999 ? y : undefined
}

type Tags = Omit<FileEntry, 'path' | 'mtime' | 'size' | 'cover' | 'error'>

// ext: the file's extension, to tell if the WAV format is worth keeping
export function normalizeTags(raw: RawTags, ext = ''): Tags {
  const c = raw.common
  const f = raw.format
  const artists = (c.artists ?? []).map(cleanText).filter((a): a is string => !!a)
  const genres = (c.genre ?? []).map(cleanText).filter((g): g is string => !!g)
  const out: Tags = {
    title: cleanText(c.title),
    artist: cleanText(c.artist) ?? (artists.length ? artists.join(', ') : undefined),
    albumArtist: cleanText(c.albumartist),
    album: cleanText(c.album),
    track: positive(c.track?.no),
    disc: positive(c.disk?.no),
    year: yearOf(c.year, c.date),
    genre: genres.length ? [...new Set(genres)].join(', ') : undefined,
    duration:
      typeof f.duration === 'number' && Number.isFinite(f.duration) && f.duration > 0
        ? Math.round(f.duration * 100) / 100
        : 0,
    codec: cleanText(f.codec),
    container: cleanText(f.container)
  }
  if (needsDecoding(ext, out.codec)) {
    out.sampleRate = positive(f.sampleRate)
    out.channels = positive(f.numberOfChannels)
    out.bits = positive(f.bitsPerSample)
  }
  // leave missing tags out, so the index file stays small
  for (const k of Object.keys(out) as (keyof Tags)[]) if (out[k] === undefined) delete out[k]
  return out
}

// Formats Chromium can play, plus some it can't (ALAC in m4a, WMA, APE, WavPack,
// AIFF), which main decodes with ffmpeg (see needsDecoding).
const audioExt = new Set([
  'mp3',
  'flac',
  'ogg',
  'oga',
  'opus',
  'm4a',
  'mp4',
  'aac',
  'wav',
  'webm',
  'wma',
  'ape',
  'wv',
  'aif',
  'aiff'
])

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function isAudioFile(name: string): boolean {
  return !name.startsWith('.') && audioExt.has(extOf(name))
}

export function isCueFile(name: string): boolean {
  return !name.startsWith('.') && extOf(name) === 'cue'
}

// Chromium in Electron 44 can't play these (decision 60), so main decodes them
// with ffmpeg. Other files are decoded only when the page finds it can't play them.
const decodeExt = new Set(['ape', 'wma', 'wv', 'aif', 'aiff'])

export function needsDecoding(ext: string, codec: string | undefined): boolean {
  return decodeExt.has(ext) || codec === 'ALAC'
}

// Folder images Chromium decodes (covers are resized in a hidden window).
const imageExt = new Set(['jpg', 'jpeg', 'png', 'webp'])
const coverNames = ['cover', 'folder', 'front', 'album']

// The folder's cover image, by name: cover, then folder, front, album.
export function pickFolderImage(names: string[]): string | undefined {
  let best: string | undefined
  let bestRank = Infinity
  for (const n of names) {
    if (!imageExt.has(extOf(n))) continue
    const base = n.slice(0, n.lastIndexOf('.')).toLowerCase()
    const rank = coverNames.indexOf(base)
    if (rank >= 0 && rank < bestRank) {
      best = n
      bestRank = rank
    }
  }
  return best
}

// "CD1", "Disc 2", "disk_3": a folder that holds one disc of an album.
export function isDiscFolder(name: string): boolean {
  return discFolderNumber(name) !== undefined
}

// "CD2" gives 2; a name that is not a disc folder gives undefined.
export function discFolderNumber(name: string): number | undefined {
  const m = /^(?:cd|dis[ck])[\s._-]*(\d+)$/i.exec(name.trim())
  return m ? Number(m[1]) : undefined
}

// For a file with no tags: "03 - Night Bus.mp3" gives track 3, "Night Bus".
export function titleFromFileName(name: string): { title: string; no?: number } {
  const i = name.lastIndexOf('.')
  const base = (i > 0 ? name.slice(0, i) : name).replace(/_/g, ' ').trim()
  const m = /^(\d{1,3})(?:\s*[-.)]\s*|\s+)(.+)$/.exec(base)
  if (m) return { title: m[2].trim(), no: Number(m[1]) || undefined }
  return { title: base || name }
}

export interface Picture {
  data: Uint8Array
  type?: string
}

// The front cover if one is marked, else the first picture.
export function frontCover<P extends Picture>(pictures: P[] | undefined): P | undefined {
  if (!pictures?.length) return undefined
  return pictures.find((p) => /front/i.test(p.type ?? '')) ?? pictures[0]
}
