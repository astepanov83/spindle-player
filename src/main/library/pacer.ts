// How many of one kind of disk job the scan runs at once. While a song plays
// from the disk being scanned, the scan runs fewer, and can rest after each job,
// so the audio gets the disk or the NAS link first.

// At least this long, since a NAS read pulls more than it returns (the kernel
// reads ahead), so a quick read still costs the link. Longer after a slow job,
// so the scan uses the disk at most half the time.
const minRestMs = 250

export class Pacer {
  #busy = 0
  #slow = false
  #waiting: (() => void)[] = []

  constructor(
    readonly full: number,
    readonly slow: number,
    readonly rests: boolean,
    readonly sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)),
    readonly now = (): number => performance.now()
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
    while (this.#busy >= this.limit) await new Promise<void>((r) => this.#waiting.push(r))
    this.#busy++
    const t0 = this.now()
    try {
      return await job()
    } finally {
      if (this.#slow && this.rests) await this.sleep(Math.max(minRestMs, this.now() - t0))
      this.#busy--
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
