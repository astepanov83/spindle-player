// The edit form for songs' info (ticket 129): which form is open. The songs'
// plugin builds it once main said what their tags are.
import { notice } from '../stores/notice.svelte'
import type { EditForm } from '../plugins/types'

class EditSongsStore {
  form: EditForm | null = $state.raw(null)
  // a newer ask, or the form closed: an older one that comes back late is dropped
  #n = 0

  async open(load: Promise<EditForm | undefined>): Promise<void> {
    const n = ++this.#n
    let form: EditForm | undefined
    try {
      form = await load
    } catch {
      form = undefined
    }
    if (n !== this.#n) return
    if (form) this.form = form
    else notice.show("Couldn't read the song info")
  }

  close(): void {
    this.#n++
    this.form = null
  }
}

export const editSongs = new EditSongsStore()
