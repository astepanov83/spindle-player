// Jobs sent to the hidden cover window, waiting for their answer.
// Plain TS, so the "what happens when the window goes away" rules are tested.
import type { CoverResult } from '../../shared/cover-job'
import { parseThemePalettes, type ThemePalettes } from '../../shared/palette'

// ok: the resized JPEG and/or the palette, as the job asked. bad: the picture
// can't be decoded, so don't try again. retry: nothing is known about the
// picture (window closed, crashed or stuck); try on a later scan.
export type Outcome =
  { kind: 'ok'; jpg?: Uint8Array; palette?: ThemePalettes } | { kind: 'bad' } | { kind: 'retry' }

// The window is a renderer, so its palette is checked like a file read; junk is dropped.
export function outcomeOf(r: CoverResult): Outcome {
  const palette = parseThemePalettes(r.palette)
  if (r.jpg || palette) {
    const o: Outcome = { kind: 'ok' }
    if (r.jpg) o.jpg = r.jpg
    if (palette) o.palette = palette
    return o
  }
  return r.bad ? { kind: 'bad' } : { kind: 'retry' }
}

export class PendingJobs {
  #jobs = new Map<number, { done: (o: Outcome) => void; timer: ReturnType<typeof setTimeout> }>()

  constructor(
    readonly timeoutMs: number,
    // called when a job times out, so the owner can drop a stuck window
    readonly onTimeout: () => void
  ) {}

  get size(): number {
    return this.#jobs.size
  }

  wait(id: number): Promise<Outcome> {
    return new Promise((done) => {
      const timer = setTimeout(() => {
        this.settle(id, { kind: 'retry' })
        this.onTimeout()
      }, this.timeoutMs)
      this.#jobs.set(id, { done, timer })
    })
  }

  settle(id: number, o: Outcome): void {
    const job = this.#jobs.get(id)
    if (!job) return
    clearTimeout(job.timer)
    this.#jobs.delete(id)
    job.done(o)
  }

  // Every job still waiting ends as "retry": the window is gone, the pictures are not bad.
  failAll(): void {
    for (const id of [...this.#jobs.keys()]) this.settle(id, { kind: 'retry' })
  }
}

// Rejects if `p` hasn't settled after `ms`, so a window load that hangs doesn't
// hold every cover job behind it.
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} took over ${ms} ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}
