// Jobs sent to the hidden cover window, waiting for their answer.
// Plain TS, so the "what happens when the window goes away" rules are tested.
import type { CoverResult } from '../../shared/cover-job'
import { parseThemePalettes, type ThemePalettes } from '../../shared/palette'

// ok: the resized JPEG and/or the palette, as the job asked. bad: the picture
// can't be decoded, so don't try again. retry: nothing is known about the
// picture (window closed, crashed or stuck); try on a later scan. crash: the
// window crashed while the job was in it.
export type Outcome =
  | { kind: 'ok'; jpg?: Uint8Array; palette?: ThemePalettes }
  | { kind: 'bad' }
  | { kind: 'retry'; crash?: boolean }

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
  failAll(crash = false): void {
    const o: Outcome = crash ? { kind: 'retry', crash } : { kind: 'retry' }
    for (const id of [...this.#jobs.keys()]) this.settle(id, o)
  }
}

// What a job's outcome means once it ran. A picture the window called bad, or
// one in the window when it crashed, is run once more alone ('alone'): with
// four at once, the crash may be another picture's, and a decode may fail for
// lack of memory. Alone, a crash or a failed decode is the picture's own.
export function judge(o: Outcome, alone: boolean): Outcome | 'alone' {
  const suspect = o.kind === 'bad' || (o.kind === 'retry' && o.crash)
  if (!suspect) return o
  return alone ? { kind: 'bad' } : 'alone'
}

// Room for `max` jobs at once, handed out in the order asked. A job that runs
// alone waits for the others to end, and holds back all that come after it.
export class Slots {
  #busy = 0
  #alone = false
  #queue: { alone: boolean; go: () => void }[] = []

  constructor(readonly max: number) {}

  get busy(): number {
    return this.#busy
  }

  take(alone = false): Promise<void> {
    if (!this.#queue.length && this.#fits(alone)) {
      this.#use(alone)
      return Promise.resolve()
    }
    return new Promise((go) => this.#queue.push({ alone, go }))
  }

  // The slot goes straight to the next job in line, so a job that asks in
  // between can't slip in ahead and make one more than `max`.
  give(): void {
    this.#busy--
    this.#alone = false
    while (this.#queue.length && this.#fits(this.#queue[0].alone)) {
      const next = this.#queue.shift()!
      this.#use(next.alone)
      next.go()
    }
  }

  #fits(alone: boolean): boolean {
    return !this.#alone && (alone ? this.#busy === 0 : this.#busy < this.max)
  }

  #use(alone: boolean): void {
    this.#busy++
    if (alone) this.#alone = true
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
