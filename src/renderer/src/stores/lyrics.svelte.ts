// The words of the song that plays (ticket 120): asked from main once per
// song, when it starts. Whether they show is kept per layout in settings;
// the layout says where they go (a part's `lyrics` option).
import type { Lyrics, LyricsSong } from '../../../shared/lyrics'
import type { ItemKey } from '../../../shared/plugins/items'
import { settings } from './settings.svelte'

class LyricsStore {
  // the song they are for
  #key: ItemKey | undefined
  words: Lyrics | undefined = $state.raw()
  // counts asks, so words that come late for an older song are dropped
  #asks = 0

  // turned on in this layout
  get shown(): boolean {
    return settings.lyricsShown[settings.template] === true
  }

  // on and there are words to show
  get showing(): boolean {
    return this.shown && !!this.words
  }

  setShown(on: boolean): void {
    if (on === this.shown) return
    settings.lyricsShown = { ...settings.lyricsShown, [settings.template]: on }
  }

  toggle(): void {
    this.setShown(!this.shown)
  }

  // A new song: its words are asked for, the last one's go at once. `song`
  // is read only then, so a library refresh doesn't ask again.
  async follow(key: ItemKey | undefined, song: () => LyricsSong | undefined): Promise<void> {
    if (key === this.#key) return
    this.#key = key
    this.words = undefined
    const n = ++this.#asks
    if (!key) return
    const got = await window.lyricsApi.get(key, song()).catch(() => undefined)
    if (n === this.#asks) this.words = got
  }
}

export const lyrics = new LyricsStore()
