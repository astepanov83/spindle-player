// The loudness reads (ticket 106), one or two files at a time, in the
// library process. Low priority: it runs only when nothing else does (see
// canRun), takes one file at a time while a song plays and rests after each
// as long as it took, and starts none for a while after a song starts.
// Plain TS with the reads handed in, so the rules are tested.
import type { ReadOutcome } from './loudness-read'
import type { LoudFile } from './loudness'

// files at once while nothing plays
export const loudAtOnce = 2
// no new file starts this long after a song starts to play
export const songStartMs = 5000

export interface LoudDeps {
  // the next file to read that is not running, or none
  next(running: ReadonlySet<string>): LoudFile | undefined
  read(f: LoudFile, signal: AbortSignal): Promise<ReadOutcome>
  // a read ended with curves, as bad, or for later (not stopped, not nostart)
  done(f: LoudFile, o: Extract<ReadOutcome, { kind: 'ok' | 'bad' | 'later' }>): void
  // ffmpeg could not run: the queue halts until reset()
  halted(why: string): void
  // the setting, Music files, no scan or cover jobs running, a window open
  canRun(): boolean
  playing(): boolean
  now(): number
  setTimer(f: () => void, ms: number): () => void
}

export class LoudQueue {
  #running = new Map<string, AbortController>()
  #holdUntil = 0
  // a timer is set to kick when the hold ends
  #waking = false
  // ffmpeg could not run; trying the next file at once would only fail again
  #halted = false

  constructor(readonly deps: LoudDeps) {}

  get running(): number {
    return this.#running.size
  }

  // Starts files while there is room; called whenever that may have changed.
  kick(): void {
    const d = this.deps
    if (this.#halted) return
    const wait = this.#holdUntil - d.now()
    if (wait > 0) {
      if (this.#waking) return
      this.#waking = true
      d.setTimer(() => {
        this.#waking = false
        this.kick()
      }, wait)
      return
    }
    const limit = d.playing() ? 1 : loudAtOnce
    while (this.#running.size < limit && d.canRun()) {
      const f = d.next(new Set(this.#running.keys()))
      if (!f) return
      this.#start(f)
    }
  }

  #start(f: LoudFile): void {
    const stop = new AbortController()
    this.#running.set(f.path, stop)
    const t0 = this.deps.now()
    const ended = (o: ReadOutcome): void => {
      if (this.#running.get(f.path) !== stop) return
      this.#running.delete(f.path)
      // ffmpeg keeps a few cores busy while it runs, so at most half the time
      const now = this.deps.now()
      if (this.deps.playing()) this.#holdUntil = Math.max(this.#holdUntil, now + (now - t0))
      if (o.kind === 'nostart') {
        this.#halted = true
        this.stop()
        this.deps.halted(o.why)
        return
      }
      if (o.kind !== 'stopped') this.deps.done(f, o)
      this.kick()
    }
    this.deps.read(f, stop.signal).then(ended, (e) => ended({ kind: 'nostart', why: String(e) }))
  }

  // A song is starting: its first seconds get the disk and the CPU. Reads
  // that run go on (at the lowest priority); no new one starts until later.
  hold(): void {
    this.#holdUntil = this.deps.now() + songStartMs
  }

  // Tries again after a halt: called when a scan ends or the style is chosen.
  reset(): void {
    this.#halted = false
  }

  // Stops the reads that run; they are read again later.
  stop(): void {
    for (const s of this.#running.values()) s.abort()
    this.#running.clear()
  }
}
