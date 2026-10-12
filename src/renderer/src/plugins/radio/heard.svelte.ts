// The songs kept from the radio (ticket 119): main's list, and keeping or
// letting go of one. Main checks each change and answers with the list.
import type { RadioCover } from '../../../../shared/plugins/radio/ipc'
import {
  findHeard,
  heardKey,
  withHeardCover,
  type HeardSong
} from '../../../../shared/plugins/radio/heard'
import { historyTitle } from '../../../../shared/plugins/radio/stations'
import { library } from '../../stores/library.svelte'
import { notice } from '../../stores/notice.svelte'

// The Radio tab's page of them.
export const heardPage = 'heard'

class HeardSongs {
  // oldest first, as main keeps them
  get songs(): HeardSong[] {
    return this.#songs
  }
  set songs(list: HeardSong[]) {
    this.#songs = list
    this.changed?.()
  }
  #songs: HeardSong[] = $state.raw([])
  // titles main is saving or removing now, by heardKey
  #busy = new Set<string>()
  // The radio store hears each change: the bar's heart and the recent songs'
  // hearts follow the list.
  changed: (() => void) | undefined

  load(list: HeardSong[]): void {
    this.songs = list
  }

  has(title: string): boolean {
    return !!findHeard(this.songs, title)
  }

  busy(title: string): boolean {
    return this.#busy.has(heardKey(title))
  }

  // The heart: keeps the song, or lets it go when it is kept. `name` is the
  // station's, for main when it doesn't know the station.
  toggle(stationId: string, title: string, name: string): Promise<void> {
    return this.has(title) ? this.remove(title) : this.keep(stationId, title, name)
  }

  async keep(stationId: string, title: string, name: string): Promise<void> {
    const t = historyTitle(title)
    if (!t || this.has(t)) return
    const ok = await this.#change(t, () => window.radioApi.heardSave(stationId, t, name))
    if (ok === undefined) return
    // main refuses a title the station did not play, or one while radio is off
    const s = ok ? findHeard(this.songs, t) : undefined
    if (!s) return notice.show("Couldn't save the song")
    // a click on the heart says where the song went
    notice.show(`Saved ${s.song || s.raw} to Heard on radio`, {
      label: 'Show',
      run: () => library.link('radio', heardPage)
    })
  }

  // A click lets it go, so it can come back with Undo.
  async remove(title: string): Promise<void> {
    const s = findHeard(this.songs, title)
    if (!s) return
    const ok = await this.#change(s.raw, () => window.radioApi.heardRemove(s.raw))
    if (ok === undefined) return
    if (!ok || this.has(s.raw)) return notice.show(`Couldn't remove ${s.song || s.raw}`)
    notice.show(`Removed ${s.song || s.raw}`, {
      label: 'Undo',
      run: () => void this.#change(s.raw, () => window.radioApi.heardRestore(s.raw))
    })
  }

  // A cover the lookup found after the song was kept (main keeps it too).
  cover(c: RadioCover): void {
    const next = withHeardCover(this.songs, c.title, c.cover)
    if (next !== this.songs) this.songs = next
  }

  // One change at a time per song: a second click while main works does
  // nothing (undefined). False when main could not be asked.
  async #change(title: string, ask: () => Promise<HeardSong[]>): Promise<boolean | undefined> {
    const key = heardKey(title)
    if (this.#busy.has(key)) return undefined
    this.#busy.add(key)
    this.changed?.()
    try {
      this.songs = await ask()
      return true
    } catch (e) {
      window.playbackApi.log(`Radio: songs kept: ${String(e)}`)
      return false
    } finally {
      this.#busy.delete(key)
      this.changed?.()
    }
  }
}

export const heard = new HeardSongs()
