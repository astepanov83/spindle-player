// When a song counts as played (ticket 085), and how a play shows. No DOM.
import type { Play, PlayedSong } from '../../../shared/plays'
import type { ItemKey } from '../../../shared/plugins/items'
import type { ItemInfo } from '../plugins/types'
import { heardAt } from '../queue/history'

// The scrobble rule: half the song or 4 minutes, whichever comes first. A
// length not known yet waits for the 4 minutes.
export function playNeeds(duration: number): number {
  const most = 240
  return duration > 0 ? Math.min(duration / 2, most) : most
}

// A step in the position counts as heard when it is no longer than the time
// that went by, plus this much (a late timeupdate). A longer one is a seek.
const slackSec = 1.5
// Back to the start of the same song after it counted (Repeat, a click on its
// row): a new play.
const startSec = 1

// Counts the seconds of a song heard, from what the player shows: the song,
// the position, its length and whether sound comes out. Fed whenever one of
// them changes, so it works whichever way the next song starts (a new load,
// the next part of a disc image, a second audio element). Seeks are not
// heard time. Each play counts once.
export class PlayCounter {
  #key: ItemKey | undefined
  #pos = 0
  #at = 0
  #sounding = false
  #heard = 0
  #counted = false

  // `duration`: the song's length as the player had it
  constructor(readonly count: (key: ItemKey, duration: number) => void) {}

  // `now` in ms
  hear(
    key: ItemKey | undefined,
    pos: number,
    duration: number,
    sounding: boolean,
    now: number
  ): void {
    if (key !== this.#key) {
      this.#key = key
      this.#heard = 0
      this.#counted = false
    } else {
      const step = pos - this.#pos
      const went = (now - this.#at) / 1000
      if (this.#sounding && sounding && step > 0 && step <= went + slackSec) this.#heard += step
      else if (step < 0 && pos < startSec && this.#counted) {
        this.#heard = 0
        this.#counted = false
      }
    }
    this.#pos = pos
    this.#at = now
    this.#sounding = sounding
    if (key && !this.#counted && this.#heard >= playNeeds(duration)) {
      this.#counted = true
      this.count(key, duration)
    }
  }
}

// What the play log keeps of a song (ticket 115): what the page shows of it.
// The player's length when the plugin has none.
export function playedSong(info: ItemInfo | undefined, duration: number): PlayedSong {
  const names = info?.names?.map((n) => n.name) ?? []
  const out: PlayedSong = {
    title: info?.title ?? '',
    artist: info?.subtitle ?? '',
    album: info?.group ?? '',
    albumArtist: info?.groupArtist ?? '',
    length: info?.length || (Number.isFinite(duration) && duration > 0 ? duration : 0)
  }
  if (names.length > 1) out.artists = names
  return out
}

// "21:14" today, "28 Sep" this year, "28 Sep 2024" before.
export function lastPlayedText(at: number, now: number): string {
  const year = new Date(at).getFullYear()
  const text = heardAt(at, now)
  return year === new Date(now).getFullYear() ? text : `${text} ${year}`
}

// The plays of a group of songs (an album): all of them added up, and the
// latest. None when none of them was played.
export function playsOf(keys: ItemKey[], of: (key: ItemKey) => Play | undefined): Play | undefined {
  let n = 0
  let last = 0
  for (const k of keys) {
    const p = of(k)
    if (!p) continue
    n += p.n
    last = Math.max(last, p.last)
  }
  return n ? { n, last } : undefined
}
