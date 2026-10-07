// Radio Browser's popular stations, shown under My stations before a search
// (ticket 082), so the tab has stations to try before the user knows what
// to type. Asked when the tab opens and kept for the session; main asks
// Radio Browser once a run.
import type { RadioSearch } from '../../../../shared/plugins/radio/ipc'
import type { Station } from '../../../../shared/plugins/radio/stations'
import { radio } from './store.svelte'

// after a failure, the tab asks again when opened this long after
const retryMs = 30_000

export type PopularStatus = 'idle' | 'loading' | 'done' | 'unreachable'

class RadioPopularStore {
  status: PopularStatus = $state('idle')
  stations: Station[] = $state.raw([])
  // Plain fields, not status: want() runs in the view's effect, and reading
  // status there would ask again each time it changes.
  #asking = false
  #done = false
  #failedAt = -Infinity

  // The tab opened, or its search changed: asks unless it has them, is
  // asking, or failed a moment ago.
  want(): void {
    if (this.#done || this.#asking || Date.now() - this.#failedAt < retryMs) return
    this.#asking = true
    this.status = 'loading'
    void this.#run()
  }

  // a popular station, which the tab shows and plays
  find(id: string): Station | undefined {
    return this.stations.find((s) => s.id === id)
  }

  async #run(): Promise<void> {
    let r: RadioSearch
    try {
      r = await window.radioApi.popular()
    } catch {
      r = { ok: false }
    }
    this.#asking = false
    if (r.ok && r.saved) radio.searched(r.saved)
    if (r.ok) {
      this.#done = true
      this.stations = r.stations
      this.status = 'done'
    } else {
      this.#failedAt = Date.now()
      this.status = 'unreachable'
    }
  }
}

export const radioPopular = new RadioPopularStore()
