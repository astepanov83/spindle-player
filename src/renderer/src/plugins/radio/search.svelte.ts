// The Radio tab's search of Radio Browser (tickets 029, 062). It asks 400ms
// after typing stops, or at once on Enter; My stations are filtered at once
// by the page. Kept here, not in the page, so a layout rebuild keeps the results.
import type { RadioSearch } from '../../../../shared/ipc'
import type { Station } from '../../../../shared/plugins/radio/stations'
import { radio } from './store.svelte'

const waitMs = 400

export type SearchStatus = 'idle' | 'searching' | 'done' | 'unreachable'

class RadioSearchStore {
  status: SearchStatus = $state('idle')
  results: Station[] = $state.raw([])
  // the search the results are for
  #shown = ''
  // #shown is asked or answered: the same search again does nothing. A plain
  // field, not status: want() runs in the view's effect, and reading status
  // there would make a failed search ask again and again.
  #fresh = false
  #timer: ReturnType<typeof setTimeout> | undefined
  // counts searches, so an older answer that comes last is dropped
  #seq = 0

  // The search box changed, or the tab opened with it.
  want(q: string): void {
    const t = q.trim()
    if (t === this.#shown && this.#fresh) return
    clearTimeout(this.#timer)
    this.#timer = undefined
    this.#seq++
    this.#shown = t
    this.#fresh = true
    if (!t) {
      this.status = 'idle'
      this.results = []
      return
    }
    this.status = 'searching'
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      void this.#run(t)
    }, waitMs)
  }

  // Enter: what want() would ask, asked now. A search already asked or
  // answered is not asked again; a failed one is.
  now(q: string): void {
    this.want(q)
    if (this.#timer === undefined) return
    clearTimeout(this.#timer)
    this.#timer = undefined
    void this.#run(this.#shown)
  }

  // a station of the newest answer, which the tab shows and plays
  find(id: string): Station | undefined {
    return this.results.find((s) => s.id === id)
  }

  async #run(q: string): Promise<void> {
    const n = ++this.#seq
    let r: RadioSearch
    try {
      r = await window.radioApi.search(q)
    } catch {
      r = { ok: false }
    }
    // main has changed My stations already, so an older answer counts too
    if (r.ok && r.saved) radio.searched(r.saved)
    if (n !== this.#seq) return
    this.results = r.ok ? r.stations : []
    this.status = r.ok ? 'done' : 'unreachable'
    // the next want() of it asks again: the network may be back
    this.#fresh = r.ok
  }
}

export const radioSearch = new RadioSearchStore()
