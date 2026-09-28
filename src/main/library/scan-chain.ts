// The order of scans and cover prunes in the library process. Plain TS with
// the scan and prune handed in, so the rules are tested with fakes.
//   - Nothing starts before the index is read (`ready`).
//   - A new scan stops the one running. It starts once that one has let go
//     and the last prune has ended, so two scans never touch the index at once
//     and a prune never deletes a cover a newer scan uses or makes.
//   - A scan that ran to the end (or failed) is followed by its prune; a
//     stopped one is not. A prune stops when a newer scan is asked for.
//   - After close (quitting), no scan starts.

// Thrown by check() in a scan that a newer one replaced, or that was stopped.
export class Stopped extends Error {}

export interface ChainHooks {
  prune(gen: number): Promise<void>
  // a scan was stopped or replaced: wake whatever a scan waits on, so it sees that
  wake(): void
  // a scan stopped and no newer one was asked for
  stopped?(): void
  log(text: string): void
}

export class ScanChain {
  #gen = 0
  // the number of the last scan asked for
  #asked = 0
  #closed = false
  // the last scan asked for and its prune
  #last: Promise<void>
  // scans asked for whose run and prune have not ended
  #pending = 0

  constructor(
    ready: Promise<unknown>,
    readonly hooks: ChainHooks
  ) {
    // a failed start is reported where it happens
    this.#last = ready.then(
      () => {},
      () => {}
    )
  }

  // A scan or prune runs or waits to.
  get busy(): boolean {
    return this.#pending > 0
  }

  // Bumped by every scan asked for and every stop.
  get gen(): number {
    return this.#gen
  }

  stale(gen: number): boolean {
    return gen !== this.#gen
  }

  // Throws Stopped in a scan that should stop.
  check(gen: number): void {
    if (this.stale(gen)) throw new Stopped()
  }

  // Asks for a scan. Resolves when it and its prune are done, or it was
  // stopped or never ran.
  request(scan: (gen: number) => Promise<void>): Promise<void> {
    if (this.#closed) return this.#last
    const gen = ++this.#gen
    this.#asked = gen
    this.hooks.wake()
    this.#pending++
    this.#last = this.#last.then(async () => {
      try {
        await this.#scanAndPrune(scan, gen)
      } finally {
        this.#pending--
      }
    })
    return this.#last
  }

  async #scanAndPrune(scan: (gen: number) => Promise<void>, gen: number): Promise<void> {
    // a newer scan was asked for while this one waited
    if (this.stale(gen)) return
    try {
      await scan(gen)
    } catch (e) {
      if (e instanceof Stopped) {
        // stopped with no newer scan to take over (the window closed): the
        // status must not stay on its progress
        if (this.#asked <= gen && !this.#closed) this.hooks.stopped?.()
        return
      }
      this.hooks.log(`Library scan failed: ${e}`)
    }
    try {
      await this.hooks.prune(gen)
    } catch (e) {
      this.hooks.log(`Could not prune covers: ${e}`)
    }
  }

  // Stops the scan or prune running; what the scan read stays.
  stop(): void {
    ++this.#gen
    this.hooks.wake()
  }

  // Quitting: stop, and start no scan after this.
  close(): void {
    this.#closed = true
    this.stop()
  }
}

// Whether the page should get the library every so often while a scan runs.
// Only while it has no songs yet (the first scan fills it in as it goes). A
// scan stopped part way, by Add folder for one, leaves this on for the next.
export class FirstFill {
  #on = false

  get on(): boolean {
    return this.#on
  }

  // pageEmpty: the page got no songs so far
  start(pageEmpty: boolean): void {
    if (pageEmpty) this.#on = true
  }

  // a scan ran to the end (or failed): the page has all there is
  end(): void {
    this.#on = false
  }
}
