// How often a crashed worker is started again: a few times, then give up,
// so a file that crashes it on every start doesn't loop forever.
export class RestartBudget {
  #times: number[] = []

  constructor(
    readonly max: number,
    readonly windowMs: number
  ) {}

  // true if one more restart is fine at `now`, and counts it
  take(now: number): boolean {
    this.#times = this.#times.filter((t) => now - t < this.windowMs)
    if (this.#times.length >= this.max) return false
    this.#times.push(now)
    return true
  }
}
