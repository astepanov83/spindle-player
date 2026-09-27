// Jobs sent to the hidden cover window, waiting for their answer.
// Plain TS, so the "what happens when the window goes away" rules are tested.
import type { CoverResult } from '../../shared/cover-job'

// ok: the resized JPEG. bad: the picture can't be decoded, so don't try again.
// retry: nothing is known about the picture (window closed, crashed or stuck); try on a later scan.
export type Outcome = { kind: 'ok'; jpg: Uint8Array } | { kind: 'bad' } | { kind: 'retry' }

export function outcomeOf(r: CoverResult): Outcome {
  if (r.jpg) return { kind: 'ok', jpg: r.jpg }
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
