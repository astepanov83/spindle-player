// Reads a music file's tags without reading much of the file. On a NAS a whole
// file can take a minute, and music-metadata reads whole files in some cases:
// an APE with the old header (before 3.98), a duration count for mp3 or Ogg,
// or a file that is not what its name says. So every read counts against a
// budget, and durations come from the header or the last page instead.
import { open, type FileHandle } from 'fs/promises'
import { parseFromTokenizer, type IAudioMetadata } from 'music-metadata'
import {
  AbstractTokenizer,
  EndOfStreamError,
  type IRandomAccessFileInfo,
  type IReadChunkOptions
} from 'strtok3'
import { gainTagsOf } from './replaygain'
import { extOf, type Picture, type RawTags } from './tags'

const MB = 1024 * 1024
// The last Ogg page starts within this many bytes of the end.
const oggTail = 65536
// Reads bigger than this are a whole tag or picture; smaller ones are headers,
// frames and pages. An Ogg page is at most 65307 bytes.
const bigRead = 65536

// How much a tag read may read of a file of `size` bytes. A good file is read
// as a few headers plus whole tags and pictures, wherever they are (an APEv2 or
// ID3v1 tag sits at the end). A bad one is read by searching it bit by bit (an
// mp3 that isn't one) or in one read of the rest of it (an old APE).
// - small: all the small reads together; a search stops after a quarter of
//   the file, so a broken file costs little on every Rescan.
// - single: one tag or picture, up to half the file. Files up to 8 MB may be
//   mostly picture (a short intro with a big cover).
// - total: everything, so a huge file never costs more than this.
export function readBudget(size: number): { small: number; single: number; total: number } {
  return { small: Math.max(2 * MB, size / 4), single: Math.max(4 * MB, size / 2), total: 32 * MB }
}

export class ReadLimitError extends Error {
  constructor(readonly read: number) {
    super(`Tags not read: the reader would read too much of the file (${read >> 10} KB so far)`)
  }
}

// Reads the file like strtok3's own file tokenizer, but throws before a read
// that would go past the budget.
class BudgetTokenizer extends AbstractTokenizer {
  fileInfo: IRandomAccessFileInfo
  #small = 0
  #total = 0

  constructor(
    readonly handle: FileHandle,
    path: string,
    size: number,
    readonly budget: ReturnType<typeof readBudget>
  ) {
    super()
    this.fileInfo = { path, size }
  }

  #charge(length: number): void {
    const b = this.budget
    const big = length > bigRead
    if (
      this.#total + length > b.total ||
      (big && length > b.single) ||
      (!big && this.#small + length > b.small)
    )
      throw new ReadLimitError(this.#total)
    this.#total += length
    if (!big) this.#small += length
  }

  async #read(buf: Uint8Array, options: IReadChunkOptions | undefined): Promise<number> {
    const o = this.normalizeOptions(buf, options)
    this.#charge(o.length)
    if (o.length === 0) return 0
    const { bytesRead } = await this.handle.read(buf, 0, o.length, o.position)
    if (bytesRead < o.length && !o.mayBeLess) throw new EndOfStreamError()
    return bytesRead
  }

  async readBuffer(buf: Uint8Array, options?: IReadChunkOptions): Promise<number> {
    this.position = options?.position ?? this.position
    const n = await this.#read(buf, options)
    this.position += n
    return n
  }

  peekBuffer(buf: Uint8Array, options?: IReadChunkOptions): Promise<number> {
    return this.#read(buf, options)
  }

  supportsRandomAccess(): boolean {
    return true
  }

  setPosition(position: number): void {
    this.position = position
  }
}

// Tags as music-metadata gives them, or ffprobe (no pictures then).
export type Meta = RawTags & { common: { picture?: Picture[] } }

// Throws if the file can't be read, or can't be read cheaply (ReadLimitError),
// and `probe` (ffprobe) can't read it either.
export async function readTags(
  path: string,
  options: {
    skipCovers?: boolean
    budget?: ReturnType<typeof readBudget>
    probe?: (path: string) => Promise<RawTags>
  } = {}
): Promise<Meta> {
  const handle = await open(path, 'r')
  try {
    const size = (await handle.stat()).size
    const ext = extOf(path)
    if (ext === 'ape') {
      const old = oldApeHeader(await readAt(handle, 0, 32))
      if (old) {
        // music-metadata can't read these; ffprobe can, including the tags
        const p = await options.probe?.(path).catch(() => undefined)
        return {
          common: p?.common ?? {},
          format: { ...p?.format, ...old },
          ...(p?.gain && { gain: p.gain })
        }
      }
    }
    let meta: IAudioMetadata
    try {
      const tokenizer = new BudgetTokenizer(handle, path, size, options.budget ?? readBudget(size))
      meta = await parseFromTokenizer(tokenizer, {
        skipCovers: options.skipCovers ?? false,
        // a duration count reads the whole mp3 or Ogg file; see below
        duration: false
      })
    } catch (error) {
      if (!options.probe) throw error
      // the file falls back to its name only if ffprobe fails too
      return await options.probe(path).catch(() => Promise.reject(error))
    }
    const f = meta.format
    let duration = f.duration
    if (!duration && f.container === 'Ogg' && size > 0) {
      const tail = await readAt(handle, Math.max(0, size - oggTail), oggTail)
      duration = oggDuration(tail, f.codec === 'Opus' ? 48000 : f.sampleRate)
    }
    // an mp3 with no header that counts its frames: a guess from the bitrate
    // (the page takes the real length when the song plays)
    if (!duration && f.container === 'MPEG' && f.bitrate) duration = (size * 8) / f.bitrate
    const gain = gainTagsOf(
      Object.values(meta.native)
        .flat()
        .map((t): [string, unknown] => [t.id, t.value])
    )
    return { common: meta.common, format: { ...f, duration }, ...(gain && { gain }) }
  } finally {
    await handle.close()
  }
}

async function readAt(handle: FileHandle, position: number, length: number): Promise<Uint8Array> {
  const buf = new Uint8Array(length)
  const { bytesRead } = await handle.read(buf, 0, length, position)
  return buf.subarray(0, bytesRead)
}

// Monkey's Audio before 3.98 has a header music-metadata doesn't know. It
// reads it as the new one and then reads the whole file looking for the tags.
// Only the length is taken from it.
export function oldApeHeader(b: Uint8Array):
  | {
      container: string
      duration: number
      sampleRate: number
      numberOfChannels: number
      bitsPerSample: number
    }
  | undefined {
  if (b.length < 32 || String.fromCharCode(...b.subarray(0, 4)) !== 'MAC ') return undefined
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const version = v.getUint16(4, true)
  if (version >= 3980) return undefined
  const compression = v.getUint16(6, true)
  const flags = v.getUint16(8, true)
  const channels = v.getUint16(10, true)
  const sampleRate = v.getUint32(12, true)
  const totalFrames = v.getUint32(24, true)
  const finalFrameBlocks = v.getUint32(28, true)
  // as Monkey's Audio's own reader works it out
  let blocksPerFrame = version >= 3900 || (version >= 3800 && compression === 4000) ? 73728 : 9216
  if (version >= 3950) blocksPerFrame = 73728 * 4
  const blocks = totalFrames ? (totalFrames - 1) * blocksPerFrame + finalFrameBlocks : 0
  return {
    container: "Monkey's Audio",
    duration: sampleRate ? blocks / sampleRate : 0,
    sampleRate,
    numberOfChannels: channels,
    // format flags: 1 is 8-bit, 8 is 24-bit
    bitsPerSample: flags & 1 ? 8 : flags & 8 ? 24 : 16
  }
}

// The length of an Ogg stream from the granule position of its last page.
// Limits: Opus pre-skip (a few ms of padding at the start) is not taken off,
// as music-metadata doesn't either. A file with several streams gets the
// length of whichever stream has the last page.
export function oggDuration(tail: Uint8Array, sampleRate: number | undefined): number | undefined {
  if (!sampleRate) return undefined
  const v = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  // "OggS", version 0, then the granule position at +6
  for (let i = tail.length - 27; i >= 0; i--) {
    if (tail[i] !== 0x4f || tail[i + 1] !== 0x67 || tail[i + 2] !== 0x67 || tail[i + 3] !== 0x53)
      continue
    if (tail[i + 4] !== 0) continue
    const granule = v.getBigInt64(i + 6, true)
    if (granule > 0n) return Number(granule) / sampleRate
  }
  return undefined
}
