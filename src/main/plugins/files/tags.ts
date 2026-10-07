// Turns what music-metadata reads into a clean FileEntry, plus the file name rules.
// Plain functions, so they are tested without real files.
import { replayGainOf, type GainTags } from './replaygain'
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
    musicbrainz_releasegroupid?: string
    musicbrainz_albumid?: string
  }
  format: {
    duration?: number
    codec?: string
    container?: string
    sampleRate?: number
    numberOfChannels?: number
    bitsPerSample?: number
  }
  // ReplayGain tags as written (ticket 090); music-metadata's own reading
  // misses APE album gains and Opus R128 gains, so they come from its
  // native tags
  gain?: GainTags
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

const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

// A tag may hold several ids joined by "/" or ";"; the first one is enough.
function mbid(v: unknown): string | undefined {
  return typeof v === 'string' ? uuid.exec(v)?.[0].toLowerCase() : undefined
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
    container: cleanText(f.container),
    mbReleaseGroup: mbid(c.musicbrainz_releasegroupid),
    mbRelease: mbid(c.musicbrainz_albumid),
    gain: replayGainOf(raw.gain),
    sampleRate: playRate(cleanText(f.codec), f.sampleRate)
  }
  if (needsDecoding(ext, out.codec)) {
    out.channels = positive(f.numberOfChannels)
    out.bits = positive(f.bitsPerSample)
  }
  // leave missing tags out, so the index file stays small
  for (const k of Object.keys(out) as (keyof Tags)[]) if (out[k] === undefined) delete out[k]
  return out
}

// The rate the file's sound comes out at once decoded, which the page runs
// its audio graph at (ticket 091). Opus always decodes at 48 kHz; its header
// gives the rate the sound had before it was encoded.
function playRate(codec: string | undefined, rate: unknown): number | undefined {
  return codec === 'Opus' ? 48000 : positive(rate)
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
// Subfolders with scans of the booklet; their front is the album's cover.
const artFolders = new Set(['scans', 'scan', 'artwork', 'art', 'covers', 'images'])
// Words in the names of pictures that are not the front.
const notFront = new Set([
  'back',
  'rear',
  'inlay',
  'inside',
  'inner',
  'booklet',
  'book',
  'cd',
  'disc',
  'disk',
  'tray',
  'label',
  'matrix',
  'obi',
  'spine'
])

// Lower is better. A folder's own image beats one from its scans folder.
const rank = {
  wmp: coverNames.length,
  wmpSmall: coverNames.length + 1,
  folderName: coverNames.length + 2,
  artFront: coverNames.length + 3,
  artCover: coverNames.length + 4,
  only: coverNames.length + 5,
  artOnly: coverNames.length + 6
}

export interface FolderImagePick {
  name: string
  rank: number
}

const baseOf = (name: string): string => name.slice(0, name.lastIndexOf('.')).toLowerCase()
const wordsOf = (base: string): string[] => base.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
const looksLikeBack = (base: string): boolean => wordsOf(base).some((w) => notFront.has(w))

// A folder's own image that no image in a scans subfolder can beat, so the
// scan can read it before the subfolder is listed.
export function isSurePick(p: FolderImagePick): boolean {
  return p.rank <= rank.folderName
}

// the same rank: the name that sorts first, so readdir order doesn't matter
function best(picks: FolderImagePick[]): FolderImagePick | undefined {
  let out: FolderImagePick | undefined
  for (const p of picks)
    if (!out || p.rank < out.rank || (p.rank === out.rank && p.name < out.name)) out = p
  return out
}

// The folder's cover image: cover, folder, front, album; then Windows Media
// Player's AlbumArt, one named after the folder, and the only image in a
// folder with songs, unless its name says it is the back or the disc.
export function pickFolderImage(names: string[], folder: string): FolderImagePick | undefined {
  const images = names.filter((n) => imageExt.has(extOf(n)))
  const folderName = folder.trim().toLowerCase()
  const picks: FolderImagePick[] = []
  for (const name of images) {
    const base = baseOf(name)
    const i = coverNames.indexOf(base)
    if (i >= 0) picks.push({ name, rank: i })
    else if (base.startsWith('albumart'))
      picks.push({ name, rank: base.endsWith('large') ? rank.wmp : rank.wmpSmall })
    else if (base === folderName) picks.push({ name, rank: rank.folderName })
  }
  // with no songs next to it, a lone picture is likelier a photo than a cover
  const songs = names.some((n) => isAudioFile(n) || isCueFile(n))
  if (images.length === 1 && songs && !looksLikeBack(baseOf(images[0])))
    picks.push({ name: images[0], rank: rank.only })
  return best(picks)
}

// "Scans", "Artwork": a subfolder with the booklet, not a disc of the album.
export function isArtFolder(name: string): boolean {
  return artFolders.has(name.trim().toLowerCase())
}

// The front picture in a scans folder: a name with "front" or "cover" that
// doesn't also say "back" or the like, else the only picture that doesn't.
export function pickArtImage(names: string[]): FolderImagePick | undefined {
  const images = names.filter((n) => imageExt.has(extOf(n)) && !looksLikeBack(baseOf(n)))
  const picks: FolderImagePick[] = []
  for (const name of images) {
    const words = wordsOf(baseOf(name))
    // "front" beats "cover"
    if (words.includes('front')) picks.push({ name, rank: rank.artFront })
    else if (words.includes('cover')) picks.push({ name, rank: rank.artCover })
  }
  if (images.length === 1) picks.push({ name: images[0], rank: rank.artOnly })
  return best(picks)
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
