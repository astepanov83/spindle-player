// Decodes one file with the bundled ffmpeg for its loudness curves (ticket
// 106): mono at a low rate, raw 16-bit samples on stdout, summed as they
// come, so an hour-long disc image never sits in memory.
import { spawn } from 'child_process'
import { open } from 'fs/promises'
import { setPriority } from 'os'
import { Energy, splitCurves, type Cut } from './loudness'

// Low: loudness is close enough without the highs, and resampling down is
// cheaper than handling every sample at 44.1 kHz.
export const decodeRate = 8000

// curves: one per cut. bad: the file can be read but ffmpeg can't decode it,
// so it is not tried again until it changes. later: the file could not be
// read or the read hung (a drive or NAS gone away): try after the next scan.
// nostart: ffmpeg itself could not run. stopped: asked to stop.
// `why` is the end of ffmpeg's error output, for the log.
export type ReadOutcome =
  | { kind: 'ok'; curves: Uint8Array[] }
  | { kind: 'bad'; why: string }
  | { kind: 'later'; why: string }
  | { kind: 'nostart'; why: string }
  | { kind: 'stopped' }

// what is kept of ffmpeg's error output
const errorTail = 300
// how long the check that the file can be read may take
const openCheckMs = 10_000

// Whether one byte of the file can be read: if not, a failed decode says
// nothing about the file.
export function canRead(path: string, ms = openCheckMs): Promise<boolean> {
  const check = (async (): Promise<boolean> => {
    const fh = await open(path, 'r')
    try {
      await fh.read(new Uint8Array(1), 0, 1, 0)
      return true
    } finally {
      await fh.close()
    }
  })().catch(() => false)
  return Promise.race([check, new Promise<boolean>((r) => setTimeout(() => r(false), ms))])
}

export function loudnessArgs(path: string): string[] {
  return [
    '-nostdin',
    '-v',
    'error',
    '-i',
    path,
    '-map',
    '0:a:0',
    '-ac',
    '1',
    '-ar',
    String(decodeRate),
    // whole 32 KB blocks, not a pipe write per packet (thousands per song)
    '-flush_packets',
    '0',
    '-f',
    's16le',
    '-'
  ]
}

// A stuck read (a NAS gone away) must not hold the queue for ever. Decoding
// is many times faster than playing, so this is generous.
export function timeoutMs(duration: number): number {
  return 120_000 + duration * 250
}

export function readLoudness(
  ffmpeg: string,
  path: string,
  duration: number,
  cuts: Cut[],
  signal: AbortSignal
): Promise<ReadOutcome> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve({ kind: 'stopped' })
    const child = spawn(ffmpeg, loudnessArgs(path), {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    // the lowest CPU priority, so playback and the page never wait on it
    try {
      if (child.pid) setPriority(child.pid, 19)
    } catch {
      // not allowed here; it still runs one or two at a time
    }
    const energy = new Energy(decodeRate)
    let why: 'stop' | 'timeout' | undefined
    const stop = (): void => {
      why ??= 'stop'
      child.kill('SIGKILL')
    }
    signal.addEventListener('abort', stop, { once: true })
    const timer = setTimeout(() => {
      why = 'timeout'
      child.kill('SIGKILL')
    }, timeoutMs(duration))
    child.stdout.on('data', (b: Buffer) => energy.add(b))
    let err = ''
    child.stderr.on('data', (b: Buffer) => {
      err = (err + b.toString()).slice(-errorTail)
    })
    const end = (o: ReadOutcome): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', stop)
      resolve(o)
    }
    let ended = false
    // ffmpeg could not run (EACCES, EMFILE...): nothing is known about the file
    child.on('error', (e) => {
      ended = true
      end({ kind: 'nostart', why: String(e) })
    })
    child.on('close', (code) => {
      if (ended) return
      if (why === 'stop') return end({ kind: 'stopped' })
      if (why === 'timeout') return end({ kind: 'later', why: 'timed out' })
      const w = energy.finish()
      if (code === 0 && w.sums.length) return end({ kind: 'ok', curves: splitCurves(w, cuts) })
      const tail = err.trim() || `exit ${code}`
      void canRead(path).then((ok) => end({ kind: ok ? 'bad' : 'later', why: tail }))
    })
  })
}
