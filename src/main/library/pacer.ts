// How many of one kind of disk job the scan runs at once. While a song plays
// from the disk being scanned, the scan runs fewer, and can rest after each job,
// so the audio gets the disk or the NAS link first.

// At least this long, since a NAS read pulls more than it returns (the kernel
// reads ahead), so a quick read still costs the link. Longer after a slow job,
// so the scan uses the disk at most half the time.
const minRestMs = 250

// Pacers that take turns while slow: one disk job at a time across all of
// them, a read's rest included. The walk, the stats and the reads run at the
// same time since ticket 022; before, they came one after another, so a song
// never shared the disk with more than one kind (decision 78).
export class Turns {
  held = false
  #waiting: (() => void)[] = []

  wait(wake: () => void): void {
    this.#waiting.push(wake)
  }

  give(): void {
    this.held = false
    const w = this.#waiting
    this.#waiting = []
    for (const f of w) f()
  }
}

export class Pacer {
  #busy = 0
  #slow = false
  #waiting: (() => void)[] = []

  constructor(
    readonly full: number,
    readonly slow: number,
    readonly rests: boolean,
    readonly sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)),
    readonly now = (): number => performance.now(),
    readonly turns?: Turns
  ) {}

  get limit(): number {
    return this.#slow ? this.slow : this.full
  }

  get busy(): number {
    return this.#busy
  }

  setSlow(slow: boolean): void {
    this.#slow = slow
    this.#wake()
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    while (this.#busy >= this.limit || (this.#slow && this.turns?.held))
      await new Promise<void>((r) => {
        this.#waiting.push(r)
        if (this.#slow) this.turns?.wait(r)
      })
    this.#busy++
    // kept to the end even if playback stops meanwhile, so the turn is given back
    const turn = this.#slow ? this.turns : undefined
    if (turn) turn.held = true
    const t0 = this.now()
    try {
      return await job()
    } finally {
      if (this.#slow && this.rests) await this.sleep(Math.max(minRestMs, this.now() - t0))
      this.#busy--
      turn?.give()
      this.#wake()
    }
  }

  #wake(): void {
    const w = this.#waiting
    this.#waiting = []
    for (const f of w) f()
  }
}

// Runs job over items through the pacer, starting as many as it allows.
export async function eachPaced<T>(
  items: T[],
  pacer: Pacer,
  job: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const runner = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++]
      await pacer.run(() => job(item))
    }
  }
  await Promise.all(Array.from({ length: Math.min(pacer.full, items.length) }, runner))
}

// Runs jobs through a pacer as they are found, in the order they came. The
// walk hands over each folder as it lists it, so stats and tag reads start
// before the walk ends (ticket 022). The first error stops the lane: jobs not
// started are dropped, and idle() rejects with it.
export class Lane {
  #jobs: (() => Promise<void>)[] = []
  #next = 0
  #running = 0
  #failed = false
  #error: unknown
  #idle: (() => void)[] = []

  constructor(readonly pacer: Pacer) {}

  push(job: () => Promise<void>): void {
    if (this.#failed) return
    this.#jobs.push(job)
    // a runner per job up to the pacer's count; the pacer still holds them to its limit
    if (this.#running < this.pacer.full) void this.#run()
  }

  // Throws the error that stopped the lane, if any.
  check(): void {
    if (this.#failed) throw this.#error
  }

  // Stops taking jobs, as if one had thrown `error`.
  stop(error: unknown): void {
    if (this.#failed) return
    this.#failed = true
    this.#error = error
    this.#jobs = []
    this.#next = 0
  }

  // Resolves when every job pushed so far has ended (jobs they push too).
  // Rejects once the lane stopped and its running jobs ended.
  async idle(): Promise<void> {
    while (this.#running > 0 || (!this.#failed && this.#next < this.#jobs.length))
      await new Promise<void>((r) => this.#idle.push(r))
    this.check()
  }

  async #run(): Promise<void> {
    this.#running++
    try {
      while (!this.#failed && this.#next < this.#jobs.length) {
        const job = this.#jobs[this.#next++]
        // drop what ran, so 100k paths don't stay in memory
        if (this.#next > 1024 && this.#next * 2 > this.#jobs.length) {
          this.#jobs = this.#jobs.slice(this.#next)
          this.#next = 0
        }
        try {
          await this.pacer.run(job)
        } catch (e) {
          this.stop(e)
        }
      }
    } finally {
      this.#running--
      if (!this.#running) {
        const w = this.#idle
        this.#idle = []
        for (const f of w) f()
      }
    }
  }
}

// Slow down while a song plays from a filesystem being scanned. `dev` is the
// playing file's device (st_dev), unknown until main has opened it.
export function scanSlow(
  playing: boolean,
  dev: number | undefined,
  scannedDevs: Set<number>
): boolean {
  if (!playing) return false
  return dev === undefined || scannedDevs.size === 0 || scannedDevs.has(dev)
}
