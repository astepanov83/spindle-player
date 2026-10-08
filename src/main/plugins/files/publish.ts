// When the page gets the library while it changes: during a scan, and while
// covers come in from the online lookup (ticket 022). Plain TS with the clock
// handed in, so the timing is tested.

// A first change goes out after this, so it carries more than one song.
const firstMs = 250

// The gap between two libraries sent: 1s for a small library, up to 5s at 50k
// songs, since the page redoes its lists (a sorted 50k table) each time. And
// the send itself (grouping and comparing the library) may take a tenth of
// the time at most, so a slow machine doesn't spend the scan on it.
export function publishGapMs(tracks: number, costMs: number): number {
  const bySize = Math.min(5000, Math.max(1000, Math.round(tracks / 10)))
  return Math.max(bySize, Math.round(costMs * 10))
}

export interface PublishDeps {
  publish(): void
  // songs in the library now
  tracks(): number
  now(): number
  // starts a timer, returns a function that cancels it
  setTimer(f: () => void, ms: number): () => void
}

export class PublishTimer {
  #cancel: (() => void) | undefined
  // when the last send ended, and how long it took
  #last = -Infinity
  #cost = 0

  constructor(readonly deps: PublishDeps) {}

  // Something changed: send it once the gap since the last send is over.
  soon(): void {
    if (this.#cancel) return
    const d = this.deps
    const at = this.#last + publishGapMs(d.tracks(), this.#cost)
    const wait = Math.max(firstMs, at - d.now())
    this.#cancel = d.setTimer(() => {
      this.#cancel = undefined
      this.now()
    }, wait)
  }

  // Sends now (a scan ended, ids moved), dropping the send that was planned.
  now(): void {
    this.#cancel?.()
    this.#cancel = undefined
    const d = this.deps
    const t0 = d.now()
    d.publish()
    this.#last = d.now()
    this.#cost = this.#last - t0
  }
}

// The gap between two sends for loudness curves alone (ticket 106): 1 ms per
// song, from 1s to 30s. The first read of a big library finishes an album
// every second or so for hours, and each send groups the whole library again.
export function loudGapMs(tracks: number): number {
  return Math.min(30000, Math.max(1000, tracks))
}

export interface PaceDeps {
  run(): void
  gapMs(): number
  now(): number
  setTimer(f: () => void, ms: number): () => void
}

// Runs at most once per gap: at once after a quiet spell, else when the gap
// since the last run is over. Asks in between are folded into that run.
export class PaceTimer {
  #cancel: (() => void) | undefined
  #last = -Infinity

  constructor(readonly deps: PaceDeps) {}

  soon(): void {
    if (this.#cancel) return
    const d = this.deps
    const wait = Math.max(0, this.#last + d.gapMs() - d.now())
    this.#cancel = d.setTimer(() => {
      this.#cancel = undefined
      this.#last = d.now()
      d.run()
    }, wait)
  }
}
