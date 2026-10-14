// The song info panel's file part (ticket 127): what the file is and every
// tag in it. Read in the library process when the panel opens, never by the
// scan (decision 229), with the same read budget as a scan's tag read.
import { stat } from 'fs/promises'
import type { IAudioMetadata } from 'music-metadata'
import type { ReplayGain } from '../../../shared/library'
import type {
  AudioFormat,
  InfoPicture,
  InfoTag,
  SongFileInfo
} from '../../../shared/plugins/files/song-info'
import { run } from './probe'
import { readTags, ReadLimitError, type Meta } from './read-tags'
import { gainTagsOf, replayGainOf } from './replaygain'

// A song's file as the index knows it. A CUE track's path is its image's.
export interface SongFile {
  path: string
  cue?: { sheet: string; start: number; end?: number }
  added?: number
  year?: number
  genre?: string
  // the index's: for a CUE track, worked out from its sheet
  gain?: ReplayGain
}

export interface SongInfoIo {
  stat(path: string): Promise<{ size: number; mtimeMs: number }>
  readTags(path: string): Promise<Meta>
  // ffprobe's view, for a file music-metadata can't read; none without ffprobe
  probe?(path: string): Promise<ProbeInfo>
}

export interface ProbeInfo {
  format: AudioFormat
  tags: InfoTag[]
}

// A value longer than this is cut: whole lyrics fit, a stray binary blob doesn't.
export const maxValue = 64 * 1024
// More tags than any real file has; the rest are counted.
export const maxTags = 1000

export async function readSongInfo(f: SongFile, io: SongInfoIo = fileIo): Promise<SongFileInfo> {
  const info: SongFileInfo = { path: f.path }
  if (f.cue) info.cue = { ...f.cue }
  if (f.added) info.added = f.added
  if (f.year) info.year = f.year
  if (f.genre) info.genre = f.genre
  if (f.gain) info.gain = f.gain
  if (
    f.cue &&
    !(await io.stat(f.cue.sheet).then(
      () => true,
      () => false
    ))
  )
    info.cue!.sheetGone = true
  try {
    const s = await io.stat(f.path)
    info.size = s.size
    info.modified = Math.round(s.mtimeMs)
  } catch (e) {
    if (codeOf(e) === 'ENOENT') info.gone = true
    info.error = plainError(e)
    return info
  }
  let meta: Meta
  try {
    meta = await io.readTags(f.path)
  } catch (e) {
    const p = await io.probe?.(f.path).catch(() => undefined)
    if (!p) {
      info.error = plainError(e)
      return info
    }
    info.probed = true
    info.format = withBitrate(p.format, info.size ?? 0, 0)
    putTags(info, p.tags)
    if (!f.cue) setGain(info, gainOf(p.tags))
    return info
  }
  const tags = nativeTags(meta.native ?? {})
  // an old Monkey's Audio file: music-metadata reads only its header
  if (!meta.native) {
    const p = await io.probe?.(f.path).catch(() => undefined)
    if (p) {
      info.probed = true
      tags.push(...p.tags)
    }
  }
  const pictures = tags.reduce((n, t) => n + (t.picture?.bytes ?? 0), 0)
  info.format = withBitrate(formatOf(meta.format), info.size ?? 0, pictures)
  putTags(info, tags)
  // a CUE track's gain is its sheet's, worked out when the library was built
  if (!f.cue) setGain(info, replayGainOf(meta.gain) ?? gainOf(tags))
  return info
}

// what the file says now, over what the index kept
function setGain(info: SongFileInfo, gain: ReplayGain | undefined): void {
  if (gain) info.gain = gain
  else delete info.gain
}

const gainOf = (tags: InfoTag[]): ReplayGain | undefined =>
  replayGainOf(gainTagsOf(tags.map((t): [string, unknown] => [t.id, t.value])))

function putTags(info: SongFileInfo, tags: InfoTag[]): void {
  if (tags.length > maxTags) info.moreTags = tags.length - maxTags
  info.tags = tags.slice(0, maxTags)
}

function formatOf(f: Meta['format']): AudioFormat {
  const out: AudioFormat = {
    container: text(f.container),
    codec: text(f.codec),
    profile: text(f.codecProfile),
    tool: text(f.tool),
    lossless: typeof f.lossless === 'boolean' ? f.lossless : undefined,
    sampleRate: positive(f.sampleRate),
    bits: positive(f.bitsPerSample),
    channels: positive(f.numberOfChannels),
    bitrate: positive(f.bitrate),
    duration: positive(f.duration)
  }
  return clean(out)
}

// A bitrate the header doesn't give is the file's size over its length,
// pictures left out: about right for a file that is mostly sound.
export function withBitrate(f: AudioFormat, size: number, pictureBytes: number): AudioFormat {
  if (f.bitrate) return { ...f, bitrateFrom: 'header' }
  const sound = size - pictureBytes
  if (!f.duration || sound <= 0) return f
  return { ...f, bitrate: Math.round((sound * 8) / f.duration), bitrateFrom: 'size' }
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined

const positive = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined

function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k]
  return o
}

// Every native tag as text, pictures as what they are.
export function nativeTags(native: IAudioMetadata['native']): InfoTag[] {
  const out: InfoTag[] = []
  for (const [type, list] of Object.entries(native))
    for (const t of list) {
      const picture = pictureOf(t.value)
      if (picture) {
        out.push({ type, id: t.id, value: '', picture })
        continue
      }
      const v = valueText(t.value)
      const tag: InfoTag = { type, id: t.id, value: v.slice(0, maxValue) }
      if (v.length > maxValue) tag.cut = true
      out.push(tag)
    }
  return out
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array)

function pictureOf(v: unknown): InfoPicture | undefined {
  if (!isObject(v) || !(v.data instanceof Uint8Array)) return undefined
  const p: InfoPicture = { bytes: v.data.length, ...imageSize(v.data) }
  const kind = text(v.type)
  const format = text(v.format)
  if (kind) p.kind = kind
  if (format)
    p.format = format.includes('/') ? format.toLowerCase() : `image/${format.toLowerCase()}`
  return p
}

// Tag values come as text, numbers, lists, or objects for comments, lyrics
// and user tags ({ descriptor, text }).
export function valueText(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v)
  if (v instanceof Uint8Array) return `${v.length.toLocaleString('en-US')} bytes of data`
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return v.map(valueText).join(', ')
  if (isObject(v)) {
    const body =
      typeof v.text === 'string' && v.text
        ? v.text
        : Array.isArray(v.syncText)
          ? v.syncText.map((s) => (isObject(s) ? String(s.text ?? '') : '')).join('\n')
          : undefined
    if (body !== undefined) {
      const d = text(v.descriptor) ?? text(v.description)
      return d ? `${d}: ${body}` : body
    }
    try {
      return JSON.stringify(v, (_, x) =>
        x instanceof Uint8Array
          ? `${x.length} bytes of data`
          : typeof x === 'bigint'
            ? String(x)
            : x
      )
    } catch {
      return ''
    }
  }
  return ''
}

// Width and height from the start of a PNG, JPEG, GIF or WebP.
export function imageSize(b: Uint8Array): { width?: number; height?: number } {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const ascii = (at: number, n: number): string =>
    at + n <= b.length ? String.fromCharCode(...b.subarray(at, at + n)) : ''
  const size = (width: number, height: number): { width?: number; height?: number } =>
    width > 0 && height > 0 ? { width, height } : {}
  if (ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR' && b.length >= 24)
    return size(v.getUint32(16), v.getUint32(20))
  if (ascii(0, 3) === 'GIF' && b.length >= 10)
    return size(v.getUint16(6, true), v.getUint16(8, true))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP' && b.length >= 30) {
    const chunk = ascii(12, 4)
    if (chunk === 'VP8 ')
      return size(v.getUint16(26, true) & 0x3fff, v.getUint16(28, true) & 0x3fff)
    if (chunk === 'VP8L') {
      const bits = v.getUint32(21, true)
      return size((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
    }
    if (chunk === 'VP8X') {
      const w = b[24] | (b[25] << 8) | (b[26] << 16)
      const h = b[27] | (b[28] << 8) | (b[29] << 16)
      return size(w + 1, h + 1)
    }
    return {}
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let at = 2
    while (at + 9 <= b.length) {
      if (b[at] !== 0xff) return {}
      const marker = b[at + 1]
      // padding, and markers with no length
      if (marker === 0xff) {
        at++
        continue
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        at += 2
        continue
      }
      // a start of frame holds the size; C4, C8 and CC are other tables
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return size(v.getUint16(at + 7), v.getUint16(at + 5))
      at += 2 + v.getUint16(at + 2)
    }
  }
  return {}
}

function codeOf(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : undefined
}

// Why a file could not be read, for people.
export function plainError(e: unknown): string {
  const code = codeOf(e)
  if (code === 'ENOENT')
    return 'The file is not there any more. It was moved or deleted after the last scan.'
  if (code === 'EACCES' || code === 'EPERM') return 'Spindle is not allowed to read this file.'
  if (code === 'EIO') return 'The disk gave an error while the file was read.'
  if (code === 'EISDIR') return 'This is a folder, not a file.'
  if (e instanceof ReadLimitError)
    return 'Its tags could not be read without reading too much of the file.'
  const name = e instanceof Error ? e.name : ''
  if (name === 'CouldNotDetermineFileTypeError' || name === 'UnsupportedFileTypeError')
    return 'The file is not in an audio format Spindle can read.'
  const message = e instanceof Error ? e.message : String(e)
  return `The file could not be read: ${message.slice(0, 300)}`
}

// --- ffprobe ---

const probeEntries =
  'format=format_long_name,duration,bit_rate:format_tags' +
  ':stream=codec_name,codec_long_name,codec_type,profile,sample_rate,channels,bits_per_raw_sample,bits_per_sample,bit_rate,duration:stream_tags'

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined
}

// ffprobe's JSON as the panel's format and tags. Its tags are the container's
// (format) and the audio stream's (Ogg keeps them there).
export function probeToInfo(json: unknown): ProbeInfo | undefined {
  if (!isObject(json)) return undefined
  const format = isObject(json.format) ? json.format : {}
  const streams = Array.isArray(json.streams) ? json.streams.filter(isObject) : []
  const audio = streams.find((s) => s.codec_type === 'audio')
  if (!audio) return undefined
  const tags: InfoTag[] = []
  for (const t of [format.tags, audio.tags])
    if (isObject(t))
      for (const [id, v] of Object.entries(t)) {
        const value = valueText(v)
        const tag: InfoTag = { type: 'ffprobe', id, value: value.slice(0, maxValue) }
        if (value.length > maxValue) tag.cut = true
        tags.push(tag)
      }
  const profile = text(audio.profile)
  return {
    format: clean({
      container: text(format.format_long_name),
      codec: audio.codec_name === 'alac' ? 'ALAC' : text(audio.codec_long_name),
      profile: profile === 'unknown' ? undefined : profile,
      sampleRate: num(audio.sample_rate),
      bits: num(audio.bits_per_raw_sample) ?? num(audio.bits_per_sample),
      channels: num(audio.channels),
      bitrate: num(audio.bit_rate) ?? num(format.bit_rate),
      duration: num(format.duration) ?? num(audio.duration)
    }),
    tags
  }
}

export async function probeInfo(bin: string, path: string): Promise<ProbeInfo> {
  // "file:" so a name is never taken for another ffmpeg protocol
  const out = await run(bin, [
    '-v',
    'error',
    '-show_entries',
    probeEntries,
    '-of',
    'json',
    `file:${path}`
  ])
  const info = probeToInfo(JSON.parse(out))
  if (!info) throw new Error('ffprobe found no audio')
  return info
}

const fileIo: SongInfoIo = {
  stat,
  // pictures too, to list them; ffprobe is asked here, not by readTags
  readTags: (path) => readTags(path, { native: true })
}

// The io with ffprobe, once the library process knows where it is.
export function songInfoIo(ffprobe: string | undefined): SongInfoIo {
  return ffprobe ? { ...fileIo, probe: (path) => probeInfo(ffprobe, path) } : fileIo
}
