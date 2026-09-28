// ffprobe, for files music-metadata can't read (ticket 012): old Monkey's
// Audio files, and anything that fails or would read too much of the file.
import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import type { RawTags } from './tags'

// A stuck read (a NAS gone away) must not hold a scan slot for ever.
const probeTimeoutMs = 30000
// The JSON for one file is a few KB; a file with huge tags is cut off here.
const maxOutput = 1024 * 1024

const entries =
  'format=format_long_name,duration:format_tags' +
  ':stream=codec_name,codec_long_name,codec_type,sample_rate,channels,bits_per_raw_sample,bits_per_sample,duration:stream_tags'

// Runs a program with an argument list (never a shell) and hands each piece of
// its output to `onText` as it comes.
export function stream(
  bin: string,
  args: string[],
  onText: (text: string) => void,
  timeoutMs = probeTimeoutMs,
  limit = maxOutput
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    // keeps a UTF-8 character split between two pieces whole
    const text = new StringDecoder('utf8')
    let size = 0
    // past the cap: the output is cut off, even if the program ends well first
    let over = false
    let err = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', (b: Buffer) => {
      size += b.length
      if (over) return
      if (size <= limit) onText(text.write(b))
      else {
        over = true
        child.kill('SIGKILL')
      }
    })
    child.stderr.on('data', (b: Buffer) => {
      if (err.length < 2000) err += b.toString()
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (over) reject(new Error(`${bin} said more than ${limit} bytes`))
      else if (code === 0) {
        onText(text.end())
        resolve()
      } else reject(new Error(`${bin} failed (${signal ?? code}): ${err.trim().slice(0, 300)}`))
    })
  })
}

// Runs a program with an argument list (never a shell) and gives its output.
export async function run(
  bin: string,
  args: string[],
  timeoutMs = probeTimeoutMs,
  limit = maxOutput
): Promise<string> {
  const out: string[] = []
  await stream(bin, args, (t) => out.push(t), timeoutMs, limit)
  return out.join('')
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined
}

// "3/12" or "3" gives 3
function noOf(v: string | undefined): { no: number | null } | undefined {
  if (v === undefined) return undefined
  const n = Number(/^\s*(\d+)/.exec(v)?.[1])
  return { no: n > 0 ? n : null }
}

// ffprobe's JSON as the RawTags music-metadata would give. Tag names differ
// by format and case (TITLE, title, ALBUM ARTIST, album_artist...).
export function probeToTags(json: unknown): RawTags | undefined {
  if (!isObject(json)) return undefined
  const format = isObject(json.format) ? json.format : {}
  const streams = Array.isArray(json.streams) ? json.streams.filter(isObject) : []
  const audio = streams.find((s) => s.codec_type === 'audio')
  if (!audio) return undefined
  const tags = new Map<string, string>()
  // format tags first; stream tags (Ogg keeps them there) fill in the rest
  for (const t of [format.tags, audio.tags])
    if (isObject(t))
      for (const [k, v] of Object.entries(t)) {
        const key = k.toLowerCase().replace(/[\s_]/g, '')
        if (typeof v === 'string' && !tags.has(key)) tags.set(key, v)
      }
  const genre = tags.get('genre')
  return {
    common: {
      title: tags.get('title'),
      artist: tags.get('artist'),
      albumartist: tags.get('albumartist'),
      album: tags.get('album'),
      track: noOf(tags.get('track') ?? tags.get('tracknumber')),
      disk: noOf(tags.get('disc') ?? tags.get('discnumber')),
      date: tags.get('date') ?? tags.get('year'),
      genre: genre ? [genre] : undefined,
      musicbrainz_releasegroupid: tags.get('musicbrainzreleasegroupid'),
      musicbrainz_albumid: tags.get('musicbrainzalbumid')
    },
    format: {
      duration: num(format.duration) ?? num(audio.duration),
      codec:
        audio.codec_name === 'alac'
          ? 'ALAC'
          : typeof audio.codec_long_name === 'string'
            ? audio.codec_long_name
            : undefined,
      container: typeof format.format_long_name === 'string' ? format.format_long_name : undefined,
      sampleRate: num(audio.sample_rate),
      numberOfChannels: num(audio.channels),
      bitsPerSample: num(audio.bits_per_raw_sample) ?? num(audio.bits_per_sample)
    }
  }
}

// Tags and format of one file. Throws if ffprobe can't read it.
export async function probeTags(bin: string, path: string): Promise<RawTags> {
  // "file:" so a name is never taken for another ffmpeg protocol
  const out = await run(bin, [
    '-v',
    'error',
    '-show_entries',
    entries,
    '-of',
    'json',
    `file:${path}`
  ])
  const tags = probeToTags(JSON.parse(out))
  if (!tags) throw new Error('ffprobe found no audio')
  return tags
}

// The real length from the last audio packet's end, for files whose container
// has no sample count (an mp3 with no Xing header, raw ADTS AAC). ffprobe's
// own length for those is a guess from the bitrate. It reads ffprobe's
// "pts_time,duration_time" lines as they come and keeps only the first start
// and the latest end, so a long file's output (up to 64 MB) is never held or
// parsed in one go on main's thread.
export class PacketSpan {
  #first: number | undefined
  #end: number | undefined
  // the part of a line not ended yet
  #tail = ''
  // in a line too long to be a packet, until its end
  #skipping = false

  push(text: string): void {
    const lines = (this.#tail + text).split('\n')
    this.#tail = lines.pop() ?? ''
    for (const line of lines) {
      if (this.#skipping) this.#skipping = false
      else this.#line(line)
    }
    if (this.#tail.length > maxLine) {
      this.#tail = ''
      this.#skipping = true
    }
  }

  // Seconds from the first packet to the end of the last, once all is pushed.
  length(): number | undefined {
    if (!this.#skipping) this.#line(this.#tail)
    this.#tail = ''
    this.#skipping = false
    const [first, end] = [this.#first, this.#end]
    return first !== undefined && end !== undefined && end > first ? end - first : undefined
  }

  #line(line: string): void {
    const [p, d] = line.split(',')
    const pts = Number(p)
    if (!p || !Number.isFinite(pts)) return
    this.#first ??= pts
    const e = pts + (Number(d) || 0)
    if (this.#end === undefined || e > this.#end) this.#end = e
  }
}

// A packet line is about 20 bytes; anything much longer is not one.
const maxLine = 1024

// Reads every packet of the file (not decoding them), so a whole read of it.
export async function probeLength(bin: string, path: string): Promise<number | undefined> {
  const args = ['-v', 'error', '-select_streams', 'a:0']
  args.push('-show_entries', 'packet=pts_time,duration_time', '-of', 'csv=p=0', `file:${path}`)
  const span = new PacketSpan()
  // about 20 bytes a packet: 64 MB is a few days of mp3
  await stream(bin, args, (t) => span.push(t), 120000, 64 * 1024 * 1024)
  return span.length()
}

// Containers whose length ffprobe (and music-metadata) may guess from the bitrate.
export function lengthMayBeGuessed(container: string | undefined): boolean {
  return /MPEG audio|ADTS/i.test(container ?? '')
}
