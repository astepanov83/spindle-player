// Songs not in the library (ticket 124): files opened from the system or
// dropped on the window, by their loose id (shared/plugins/files/loose.ts).
// Main sends them with the open; a key the page has from an earlier run (the
// saved queue) is asked of main the first time it is drawn.
import type { LooseSong, OpenedSongs } from '../../../../shared/plugins/files/loose'

// A failed ask (the library process restarting) is tried again after this.
const retryMs = 5000

// A number that goes up with each change; reading it makes a reader follow
// it (a $state in loose.svelte.ts). The maps below stay plain.
export interface Counter {
  get(): number
  bump(): void
}

export class LooseStore {
  #songs = new Map<string, LooseSong>()
  #gone = new Set<string>()
  // asked of main, not answered yet
  #asked = new Set<string>()
  #batch: string[] = []
  constructor(
    // bumped by each answer, so the queue sees songs come or go
    private readonly counter: Counter,
    private readonly ask: (ids: string[]) => Promise<OpenedSongs> = (ids) =>
      window.libraryApi.loose(ids),
    private readonly later: (f: () => void, ms: number) => void = (f, ms) => setTimeout(f, ms)
  ) {}

  get version(): number {
    return this.counter.get()
  }

  // Songs main sent. Read before the queue gets their keys, so they show at once.
  add(songs: LooseSong[]): void {
    if (!songs.length) return
    for (const s of songs) {
      this.#songs.set(s.track.id, s)
      this.#gone.delete(s.track.id)
    }
    this.counter.bump()
  }

  find(id: string): LooseSong | undefined {
    void this.counter.get()
    return this.#songs.get(id)
  }

  // Whether main said its file is gone. Not yet asked: asks now, and the
  // song is on its way until the answer comes. Never changes state at once,
  // so it can be asked while the page is drawn.
  gone(id: string): boolean {
    void this.counter.get()
    if (this.#gone.has(id)) return true
    if (!this.#asked.has(id)) this.#ask(id)
    return false
  }

  #ask(id: string): void {
    this.#asked.add(id)
    this.#batch.push(id)
    if (this.#batch.length > 1) return
    queueMicrotask(() => {
      const ids = this.#batch
      this.#batch = []
      this.ask(ids).then(
        (r) => {
          for (const id of ids) this.#asked.delete(id)
          for (const s of r.loose) this.#songs.set(s.track.id, s)
          for (const id of r.gone ?? []) this.#gone.add(id)
          this.counter.bump()
        },
        (e) => {
          console.error('Could not get songs not in the library', e)
          // asked again once drawn again after the wait
          this.later(() => {
            for (const id of ids) this.#asked.delete(id)
            this.counter.bump()
          }, retryMs)
        }
      )
    })
  }
}
