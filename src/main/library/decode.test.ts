import { EventEmitter } from 'events'
import { PassThrough, type Readable } from 'stream'
import { describe, expect, it } from 'vitest'
import {
  dataSize,
  DecodeStream,
  ffmpegArgs,
  runningDecoders,
  stopAllDecoders,
  wavFormat,
  wavHeader,
  type Decoder
} from './decode'

const cd = wavFormat(44100, 2, 16)

describe('the WAV file', () => {
  it('is 16-bit unless the source has more bits', () => {
    expect(wavFormat(44100, 2).bits).toBe(16)
    expect(wavFormat(44100, 2, 16).bits).toBe(16)
    expect(wavFormat(96000, 2, 24).bits).toBe(24)
    expect(wavFormat(48000, 12, 32)).toEqual({ sampleRate: 48000, channels: 8, bits: 24 })
  })

  it('holds whole samples for the length', () => {
    expect(dataSize(cd, 1)).toBe(176400)
    expect(dataSize(cd, 0.5)).toBe(88200)
    expect(dataSize(wavFormat(44100, 2, 24), 1)).toBe(264600)
    expect(dataSize(cd, -1)).toBe(0)
  })

  it('has a standard 44-byte PCM header', () => {
    const h = wavHeader(cd, 1000)
    const v = new DataView(h.buffer)
    const ascii = (a: number, n: number): string => String.fromCharCode(...h.subarray(a, a + n))
    expect(h.length).toBe(44)
    expect(ascii(0, 4)).toBe('RIFF')
    expect(v.getUint32(4, true)).toBe(1036)
    expect(ascii(8, 8)).toBe('WAVEfmt ')
    expect(v.getUint16(20, true)).toBe(1)
    expect(v.getUint16(22, true)).toBe(2)
    expect(v.getUint32(24, true)).toBe(44100)
    expect(v.getUint32(28, true)).toBe(176400)
    expect(v.getUint16(32, true)).toBe(4)
    expect(v.getUint16(34, true)).toBe(16)
    expect(ascii(36, 4)).toBe('data')
    expect(v.getUint32(40, true)).toBe(1000)
  })
})

describe('ffmpegArgs', () => {
  it('decodes from the start with no -ss', () => {
    const a = ffmpegArgs('/m/a b.ape', 0, cd)
    expect(a).not.toContain('-ss')
    expect(a).toContain('file:/m/a b.ape')
    expect(a.slice(-7)).toEqual(['-ar', '44100', '-f', 's16le', '-c:a', 'pcm_s16le', 'pipe:1'])
  })

  it('seeks on the input, to the microsecond', () => {
    const a = ffmpegArgs('/m/x.ape', 1500.123456789, wavFormat(96000, 2, 24))
    expect(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 4)).toEqual([
      '-ss',
      '1500.123457',
      '-i',
      'file:/m/x.ape'
    ])
    expect(a).toContain('pcm_s24le')
  })

  it('never lets a file name read as an option or protocol', () => {
    const a = ffmpegArgs('-y http://x', 0, cd)
    expect(a[a.indexOf('-i') + 1]).toBe('file:-y http://x')
  })
})

// A fake ffmpeg: the test writes its output and ends it.
class FakeDecoder extends EventEmitter implements Decoder {
  stdout = new PassThrough()
  killed: string[] = []
  kill(signal?: NodeJS.Signals): boolean {
    this.killed.push(signal ?? 'SIGTERM')
    this.stdout.destroy()
    this.emit('close', null)
    return true
  }
  finish(code: number): void {
    this.stdout.end()
    this.stdout.on('end', () => setImmediate(() => this.emit('close', code)))
  }
}

async function readAll(s: Readable): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  for await (const c of s) parts.push(c as Uint8Array)
  return new Uint8Array(Buffer.concat(parts))
}

function stream(
  from: number,
  to: number,
  data = 400
): { s: DecodeStream; child: FakeDecoder; starts: number[]; header: Uint8Array } {
  const header = wavHeader(cd, data)
  const starts: number[] = []
  const child = new FakeDecoder()
  const s = new DecodeStream(header, cd, from, to, (seconds) => {
    starts.push(seconds)
    return child
  })
  return { s, child, starts, header }
}

const bytes = (n: number, first = 1): Uint8Array =>
  Uint8Array.from({ length: n }, (_, i) => first + i)

describe('DecodeStream', () => {
  it('sends the header, then ffmpeg’s output, then stops ffmpeg at the end', async () => {
    const { s, child, starts, header } = stream(0, 44 + 8 - 1)
    const all = readAll(s)
    await new Promise((r) => setImmediate(r))
    child.stdout.write(bytes(12))
    const out = await all
    expect(starts).toEqual([0])
    expect(out.subarray(0, 44)).toEqual(header)
    expect(out.subarray(44)).toEqual(bytes(8))
    expect(child.killed).toEqual(['SIGKILL'])
  })

  it('starts ffmpeg at the sample the range starts in, and drops the bytes before it', async () => {
    // byte 44 + 4 * 44100 + 2: two bytes into the sample at 1 s
    const from = 44 + 176400 + 2
    const { s, child, starts } = stream(from, from + 5, 200000)
    const all = readAll(s)
    await new Promise((r) => setImmediate(r))
    child.stdout.write(bytes(10))
    const out = await all
    expect(starts).toEqual([1])
    expect([...out]).toEqual([3, 4, 5, 6, 7, 8])
  })

  it('sends only part of the header when the range ends in it', async () => {
    const { s, starts, header } = stream(4, 11)
    expect(await readAll(s)).toEqual(header.subarray(4, 12))
    expect(starts).toEqual([])
  })

  it('fills up with silence when ffmpeg ends early', async () => {
    const { s, child } = stream(44, 44 + 9)
    const all = readAll(s)
    await new Promise((r) => setImmediate(r))
    child.stdout.write(bytes(4))
    child.finish(0)
    expect([...(await all)]).toEqual([1, 2, 3, 4, 0, 0, 0, 0, 0, 0])
  })

  it('fails when ffmpeg ends with an error before any sound', async () => {
    const { s, child } = stream(44, 100)
    const all = readAll(s)
    await new Promise((r) => setImmediate(r))
    child.finish(1)
    await expect(all).rejects.toThrow(/ffmpeg ended with code 1/)
  })

  it('stops ffmpeg when the reader goes away', async () => {
    const { s, child } = stream(44, 10000)
    s.resume()
    await new Promise((r) => setImmediate(r))
    child.stdout.write(bytes(10))
    expect(runningDecoders()).toBe(1)
    s.destroy()
    await new Promise((r) => setImmediate(r))
    expect(child.killed).toEqual(['SIGKILL'])
    expect(runningDecoders()).toBe(0)
  })

  it('pauses ffmpeg while the reader is full', async () => {
    const { s, child } = stream(44, 44 + 10 * 65536)
    // nothing reads yet, past the first call
    s.read(0)
    await new Promise((r) => setImmediate(r))
    for (let i = 0; i < 4; i++) child.stdout.write(bytes(65536, 0))
    await new Promise((r) => setImmediate(r))
    expect(child.stdout.isPaused()).toBe(true)
    s.resume()
    await new Promise((r) => setImmediate(r))
    expect(child.stdout.isPaused()).toBe(false)
    s.destroy()
  })

  it('lets ffmpeg go when nothing reads for a while', async () => {
    const header = wavHeader(cd, 10 * 65536)
    const child = new FakeDecoder()
    const s = new DecodeStream(header, cd, 44, 44 + 10 * 65536, () => child, 50)
    const failed = new Promise((r) => s.on('error', r))
    s.read(0)
    await new Promise((r) => setImmediate(r))
    for (let i = 0; i < 4; i++) child.stdout.write(bytes(65536, 0))
    expect(String(await failed)).toMatch(/Nothing read/)
    expect(child.killed).toEqual(['SIGKILL'])
  })

  it('stops every ffmpeg on quit', async () => {
    const { s, child } = stream(44, 10000)
    const failed = new Promise((r) => s.on('error', r))
    s.resume()
    await new Promise((r) => setImmediate(r))
    stopAllDecoders()
    expect(child.killed[0]).toBe('SIGKILL')
    expect(runningDecoders()).toBe(0)
    // the page's request fails; it is going away anyway
    await failed
  })
})
