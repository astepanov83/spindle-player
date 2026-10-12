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
  // the song was asked with its names
  #named = false

  // turned on in this layout
  get shown(): boolean {
    return settings.lyricsShown[settings.template] === true
  }

  // on and there are words to show
  get showing(): boolean {
    return this.shown && !!this.words
  }

  // An online lookup said the song has no words (ticket 121): a quiet note
  // in Focus. It takes no cover's or page's place, and has no button.
  get instrumental(): boolean {
    return !!this.words && 'instrumental' in this.words
  }

  // words to sing along to
  get hasWords(): boolean {
    return !!this.words && !this.instrumental
  }

  setShown(on: boolean): void {
    if (on === this.shown) return
    settings.lyricsShown = { ...settings.lyricsShown, [settings.template]: on }
  }

  toggle(): void {
    this.setShown(!this.shown)
  }

  // A new song: its words are asked for, the last one's go at once. `song`
  // is read only then, so a library refresh doesn't ask again. A song whose
  // names were not known yet (the queue kept from last time, before the
  // library is in) is asked again once they are, for the online lookup (121).
  async follow(key: ItemKey | undefined, song: () => LyricsSong | undefined): Promise<void> {
    const same = key === this.#key
    if (same && this.#named) return
    const s = key ? song() : undefined
    if (same && !s) return
    this.#key = key
    this.#named = !!s
    if (!same) this.words = undefined
    const n = ++this.#asks
    if (!key) return
    const got = await window.lyricsApi.get(key, s).catch(() => undefined)
    if (n === this.#asks) this.words = got
  }
}

export const lyrics = new LyricsStore()
