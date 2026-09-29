// The Radio view's search of Radio Browser (ticket 029). It asks 400ms after
// typing stops; My stations are filtered at once by the view itself. Kept
// here, not in the view, so a layout rebuild keeps the results.
import type { RadioSearch } from '../../../shared/ipc'
import type { Station } from '../../../shared/stations'

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

  // The search box changed, or the view opened with it.
  want(q: string): void {
    const t = q.trim()
    if (t === this.#shown && this.#fresh) return
    clearTimeout(this.#timer)
    this.#seq++
    this.#shown = t
    this.#fresh = true
    if (!t) {
      this.status = 'idle'
      this.results = []
      return
    }
    this.status = 'searching'
    this.#timer = setTimeout(() => void this.#run(t), waitMs)
  }

  async #run(q: string): Promise<void> {
    const n = ++this.#seq
    let r: RadioSearch
    try {
      r = await window.radioApi.search(q)
    } catch {
      r = { ok: false }
    }
    if (n !== this.#seq) return
    this.results = r.ok ? r.stations : []
    this.status = r.ok ? 'done' : 'unreachable'
    // the next want() of it asks again: the network may be back
    this.#fresh = r.ok
  }
}

export const radioSearch = new RadioSearchStore()
