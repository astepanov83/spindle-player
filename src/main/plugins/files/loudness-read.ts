// Decodes one file with the bundled ffmpeg for its loudness curves (ticket
// 106): mono at a low rate, raw 16-bit samples on stdout, summed as they
// come, so an hour-long disc image never sits in memory.
import { spawn } from 'child_process'
import { setPriority } from 'os'
import { Energy, splitCurves, type Cut } from './loudness'

// Low: loudness is close enough without the highs, and resampling down is
// cheaper than handling every sample at 44.1 kHz.
export const decodeRate = 8000

// curves: one per cut. bad: ffmpeg could not decode it (or hung), so it is
// not tried again until it changes. stopped: asked to stop; try again later.
export type ReadOutcome =
  { kind: 'ok'; curves: Uint8Array[] } | { kind: 'bad' } | { kind: 'stopped' }

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
      stdio: ['ignore', 'pipe', 'ignore'],
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
    const end = (o: ReadOutcome): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', stop)
      resolve(o)
    }
    // no ffmpeg to run: nothing is known about the file
    child.on('error', () => end({ kind: 'stopped' }))
    child.on('close', (code) => {
      if (why === 'stop') return end({ kind: 'stopped' })
      const w = energy.finish()
      if (why === 'timeout' || code !== 0 || !w.sums.length) return end({ kind: 'bad' })
      end({ kind: 'ok', curves: splitCurves(w, cuts) })
    })
  })
}
