// The page's songs not in the library (see loose.ts), followed through a $state.
import { LooseStore, type Counter } from './loose'

class Version implements Counter {
  #n = $state(0)
  get(): number {
    return this.#n
  }
  bump(): void {
    this.#n++
  }
}

export const loose = new LooseStore(new Version())
