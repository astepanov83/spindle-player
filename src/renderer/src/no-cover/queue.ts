// The drawings waiting for their turn (ticket 103). The newest goes first, so
// on a fast scroll the tiles now on screen are drawn before the ones passed,
// and a drawing no tile wants any more is dropped when its turn comes.

export class Dropped extends Error {}

export class TurnQueue {
  #running = 0
  // newest last
  #waiting: (() => void)[] = []

  // `wait` runs before each job: idle time in the app
  constructor(
    readonly limit: number,
    readonly wait: () => Promise<void>
  ) {}

  // Runs `job` when a turn is free, or rejects with Dropped if by then
  // `wanted` says no.
  async run<T>(job: () => Promise<T>, wanted: () => boolean): Promise<T> {
    if (this.#running >= this.limit) await new Promise<void>((go) => this.#waiting.push(go))
    else this.#running++
    try {
      if (!wanted()) throw new Dropped()
      await this.wait()
      if (!wanted()) throw new Dropped()
      return await job()
    } finally {
      // a finished one hands its turn straight on, to the newest
      const next = this.#waiting.pop()
      if (next) next()
      else this.#running--
    }
  }
}
