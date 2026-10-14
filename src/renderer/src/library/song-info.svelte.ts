// The song info panel (ticket 127): which song it shows. The song's plugin
// gives what it knows at once and the rest once its file is read.
import type { ItemKey } from '../../../shared/plugins/items'
import { songInfoOf } from '../plugins'
import type { SongInfoView } from '../plugins/types'

class SongInfoStore {
  view: SongInfoView | null = $state.raw(null)
  // still reading the file
  reading = $state(false)
  // a newer song, or the panel closed: the older read is dropped
  #n = 0

  open(key: ItemKey): void {
    const got = songInfoOf(key)
    if (!got) return
    const n = ++this.#n
    this.view = got.now
    this.reading = true
    void got.full.then((v) => {
      if (n !== this.#n) return
      this.view = v
      this.reading = false
    })
  }

  close(): void {
    this.#n++
    this.view = null
    this.reading = false
  }
}

export const songInfo = new SongInfoStore()
