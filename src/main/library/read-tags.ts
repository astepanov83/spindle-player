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
import { extOf } from './tags'

// Tags and an embedded cover fit in this for any normal file.
export const readBudget = 32 * 1024 * 1024
// The last Ogg page starts within this many bytes of the end.
const oggTail = 65536

export class ReadLimitError extends Error {}

// Reads the file like strtok3's own file tokenizer, but throws before a read
// that would take the file's reads past `limit` bytes.
class BudgetTokenizer extends AbstractTokenizer {
  fileInfo: IRandomAccessFileInfo
  #used = 0

  constructor(
    readonly handle: FileHandle,
    path: string,
    size: number,
    readonly limit: number
  ) {
    super()
    this.fileInfo = { path, size }
  }

  async #read(buf: Uint8Array, options: IReadChunkOptions | undefined): Promise<number> {
    const o = this.normalizeOptions(buf, options)
    this.#used += o.length
    if (this.#used > this.limit)
      throw new ReadLimitError(
        `Tags not read: the reader would read more than ${this.limit >> 20} MB of the file`
      )
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

export type Meta = Pick<IAudioMetadata, 'common' | 'format'>

// Throws if the file can't be read, or can't be read cheaply (ReadLimitError).
// Ticket 012: ffprobe goes where this throws, before the file falls back to its name.
export async function readTags(
  path: string,
  options: { skipCovers?: boolean; limit?: number } = {}
): Promise<Meta> {
  const handle = await open(path, 'r')
  try {
    const size = (await handle.stat()).size
    const ext = extOf(path)
    if (ext === 'ape') {
      const old = oldApeHeader(await readAt(handle, 0, 32))
      if (old) return { common: {}, format: old } as Meta
    }
    const tokenizer = new BudgetTokenizer(handle, path, size, options.limit ?? readBudget)
    const meta = await parseFromTokenizer(tokenizer, {
      skipCovers: options.skipCovers ?? false,
      // a duration count reads the whole mp3 or Ogg file; see below
      duration: false
    })
    const f = meta.format
    let duration = f.duration
    if (!duration && f.container === 'Ogg' && size > 0) {
      const tail = await readAt(handle, Math.max(0, size - oggTail), oggTail)
      duration = oggDuration(tail, f.codec === 'Opus' ? 48000 : f.sampleRate)
    }
    // an mp3 with no header that counts its frames: a guess from the bitrate
    // (the page takes the real length when the song plays)
    if (!duration && f.container === 'MPEG' && f.bitrate) duration = (size * 8) / f.bitrate
    return { common: meta.common, format: { ...f, duration } }
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
export function oldApeHeader(
  b: Uint8Array
): { container: string; duration: number; sampleRate: number } | undefined {
  if (b.length < 32 || String.fromCharCode(...b.subarray(0, 4)) !== 'MAC ') return undefined
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const version = v.getUint16(4, true)
  if (version >= 3980) return undefined
  const compression = v.getUint16(6, true)
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
    sampleRate
  }
}

// The length of an Ogg stream from the granule position of its last page.
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
