// Files Chromium can't play (APE, WMA, WavPack, AIFF, ALAC) are served as a
// WAV file that ffmpeg makes on the fly. The WAV has a known size (from the
// length in the index), so it answers Range requests like a real file: a seek
// asks for bytes further on, and that starts ffmpeg at the matching time.
// Chromium does the seeking, timing and buffering itself.
import { spawn } from 'child_process'
import { Readable } from 'stream'

export interface WavFormat {
  sampleRate: number
  channels: number
  bits: 16 | 24
}

// 24-bit sources stay 24-bit; everything else is 16-bit.
export function wavFormat(sampleRate: number, channels: number, bits?: number): WavFormat {
  return {
    sampleRate,
    channels: Math.min(8, Math.max(1, channels)),
    bits: bits && bits > 16 ? 24 : 16
  }
}

export const blockSize = (f: WavFormat): number => (f.channels * f.bits) / 8

// Bytes of sound for `seconds` of audio, whole samples only.
export function dataSize(f: WavFormat, seconds: number): number {
  return Math.max(0, Math.round(seconds * f.sampleRate)) * blockSize(f)
}

// The most a plain WAV's 32-bit RIFF size can say: 4 GiB less its header.
export const maxPlainData = 0xffffffff - 36

// A PCM WAV header: plain RIFF (44 bytes), or RF64 (80 bytes) when the sound
// is too big for RIFF's 32-bit sizes (4 GiB: 24-bit 192 kHz stereo after about
// 62 minutes). RF64 keeps the real sizes in a ds64 chunk; Chromium's WAV
// reader takes it and seeks it like a plain WAV (checked with a 4.5 GB plan).
export function wavHeader(f: WavFormat, dataBytes: number): Uint8Array {
  const big = dataBytes > maxPlainData
  const b = new Uint8Array(big ? 80 : 44)
  const v = new DataView(b.buffer)
  const ascii = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) b[at + i] = s.charCodeAt(i)
  }
  let at = 12
  ascii(0, big ? 'RF64' : 'RIFF')
  v.setUint32(4, big ? 0xffffffff : b.length - 8 + dataBytes, true)
  ascii(8, 'WAVE')
  if (big) {
    ascii(12, 'ds64')
    v.setUint32(16, 28, true)
    v.setBigUint64(20, BigInt(b.length - 8 + dataBytes), true)
    v.setBigUint64(28, BigInt(dataBytes), true)
    v.setBigUint64(36, BigInt(dataBytes / blockSize(f)), true)
    v.setUint32(44, 0, true)
    at = 48
  }
  ascii(at, 'fmt ')
  v.setUint32(at + 4, 16, true)
  v.setUint16(at + 8, 1, true)
  v.setUint16(at + 10, f.channels, true)
  v.setUint32(at + 12, f.sampleRate, true)
  v.setUint32(at + 16, f.sampleRate * blockSize(f), true)
  v.setUint16(at + 20, blockSize(f), true)
  v.setUint16(at + 22, f.bits, true)
  ascii(at + 24, 'data')
  v.setUint32(at + 28, big ? 0xffffffff : dataBytes, true)
  return b
}

// ffmpeg's arguments: decode the first audio stream from `seconds` on, as raw
// PCM on stdout. An argument list, never a shell.
export function ffmpegArgs(path: string, seconds: number, f: WavFormat): string[] {
  const pcm = f.bits === 24 ? 's24le' : 's16le'
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    ...(seconds > 0 ? ['-ss', seconds.toFixed(6)] : []),
    // "file:" so a name is never taken for another ffmpeg protocol
    '-i',
    `file:${path}`,
    '-map',
    '0:a:0',
    '-vn',
    '-ac',
    String(f.channels),
    '-ar',
    String(f.sampleRate),
    '-f',
    pcm,
    '-c:a',
    `pcm_${pcm}`,
    'pipe:1'
  ]
}

// The part of a ChildProcess used here, so tests can hand in a fake.
export interface Decoder {
  stdout: Readable
  // ffmpeg's own words on why it failed (-loglevel error)
  stderr?: Readable | null
  kill(signal?: NodeJS.Signals): boolean
  on(event: 'close', listener: (code: number | null) => void): this
  on(event: 'error', listener: (e: Error) => void): this
}

// Every ffmpeg running, so quitting can stop them all.
const running = new Set<Decoder>()

export function runningDecoders(): number {
  return running.size
}

export function stopAllDecoders(): void {
  for (const d of running) d.kill('SIGKILL')
  running.clear()
}

export function startFfmpeg(bin: string, args: string[]): Decoder {
  return spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
}

const silence = new Uint8Array(64 * 1024)

// A paused song leaves its request open and ffmpeg waiting. After this long
// with nothing read, the stream ends with an error and ffmpeg goes; Chromium
// asks again from where it was when it needs more.
export const idleMs = 20000

// The stream ended for a paused song (idleMs). Normal, so not logged.
export class IdleError extends Error {}

// how much of ffmpeg's error output is kept
const stderrKept = 1000

// Bytes `from` to `to` (inclusive) of the WAV file. ffmpeg starts on the first
// read, is paused while the reader is full, and is killed once the range is
// sent or the reader goes away (a seek, a new song, the page closing).
// If ffmpeg ends early, the rest is silence, so the size stays as promised; if
// it ends with an error before any sound, the stream fails. So does a stream
// nobody reads for idleMs.
export class DecodeStream extends Readable {
  #pos: number
  #child: Decoder | undefined
  #started = false
  #padding = false
  #ended = false
  #got = false
  // bytes of ffmpeg's output to drop first, when the range starts mid-sample
  #skip = 0
  #idle: ReturnType<typeof setTimeout> | undefined

  constructor(
    readonly header: Uint8Array,
    readonly format: WavFormat,
    from: number,
    readonly to: number,
    readonly start: (seconds: number) => Decoder,
    readonly idleAfter = idleMs
  ) {
    super()
    this.#pos = from
  }

  _read(): void {
    if (this.#padding) return this.#pad()
    if (this.#started) {
      clearTimeout(this.#idle)
      this.#child?.stdout.resume()
      return
    }
    this.#started = true
    const h = this.header
    if (this.#pos < h.length) {
      const part = h.subarray(this.#pos, Math.min(h.length, this.to + 1))
      this.#pos += part.length
      this.push(part)
      if (this.#pos > this.to) return this.#end()
    }
    const block = blockSize(this.format)
    const at = this.#pos - h.length
    const sample = Math.floor(at / block)
    this.#skip = at - sample * block
    let child: Decoder
    try {
      child = this.start(sample / this.format.sampleRate)
    } catch (e) {
      this.destroy(e as Error)
      return
    }
    this.#child = child
    running.add(child)
    let said = ''
    child.stderr?.on('data', (b: Buffer) => (said = (said + b.toString()).slice(-stderrKept)))
    child.on('error', (e) => this.destroy(e))
    child.on('close', (code) => {
      running.delete(child)
      if (this.#ended || this.destroyed) return
      if (code !== 0 && !this.#got)
        this.destroy(new Error(`ffmpeg ended with code ${code}: ${said.trim() || 'no message'}`))
      else this.#pad()
    })
    child.stdout.on('data', (b: Buffer) => this.#data(b))
  }

  #data(chunk: Uint8Array): void {
    if (this.#ended || this.destroyed) return
    let b = chunk
    if (this.#skip) {
      const n = Math.min(this.#skip, b.length)
      this.#skip -= n
      b = b.subarray(n)
    }
    const left = this.to + 1 - this.#pos
    if (b.length > left) b = b.subarray(0, left)
    if (!b.length) return
    this.#got = true
    this.#pos += b.length
    const more = this.push(b)
    if (this.#pos > this.to) this.#end()
    else if (!more) {
      this.#child?.stdout.pause()
      clearTimeout(this.#idle)
      this.#idle = setTimeout(
        () => this.destroy(new IdleError('Nothing read for a while')),
        this.idleAfter
      )
    }
  }

  // ffmpeg is done but the range is not: silence up to the promised size
  #pad(): void {
    this.#padding = true
    while (this.#pos <= this.to) {
      const n = Math.min(silence.length, this.to + 1 - this.#pos)
      this.#pos += n
      if (!this.push(silence.subarray(0, n))) return
    }
    this.#end()
  }

  #end(): void {
    if (this.#ended) return
    this.#ended = true
    this.#stop()
    this.push(null)
  }

  #stop(): void {
    clearTimeout(this.#idle)
    const c = this.#child
    if (!c) return
    this.#child = undefined
    c.kill('SIGKILL')
    running.delete(c)
  }

  _destroy(error: Error | null, done: (error?: Error | null) => void): void {
    this.#stop()
    done(error)
  }
}
