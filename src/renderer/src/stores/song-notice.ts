// When the song changes, a desktop notification says what plays (ticket 126).
// This decides when and what; main shows it, unless the window is in front.
// Pure, so it is tested; App.svelte feeds it what plays on every change.
import type { SongNotice } from '../../../shared/ipc'
import type { ItemKey } from '../../../shared/plugins/items'
import type { ItemInfo } from '../plugins/types'

// A quick run of Next presses shows only the song it ends on.
export const settleMs = 1000

// "Artist · Album", or the one of them there is (as the player bar's line)
function subLine(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(' · ')
}

// The text: the title, then the artist and album, or the station for radio.
// A station before its first song title is its name over "Radio".
export function noticeOf(info: ItemInfo, live: boolean): SongNotice | undefined {
  if (!info.title) return undefined
  const station = live && info.mediaArtist !== info.title ? info.mediaArtist : undefined
  const body = live ? (station ?? info.subtitle ?? '') : subLine(info.subtitle, info.group)
  const n: SongNotice = { title: info.title, body }
  if (info.art?.cover) n.cover = info.art.cover
  return n
}

// The part of queues this reads.
export interface Playing {
  active: 'track' | 'live'
  item: ItemKey | undefined
  live: { current: ItemKey | null }
  info: ItemInfo | undefined
  nothingPlaying: boolean
  wantsSound: boolean
}

export interface Now {
  // One song: the queue's song, or a station's title. A pause, a seek or a
  // library refresh keeps it; none while nothing can be shown.
  id: string | undefined
  wantsSound: boolean
  notice: SongNotice | undefined
}

export function nowOf(q: Playing): Now {
  const info = q.nothingPlaying || q.info?.unavailable ? undefined : q.info
  const live = q.active === 'live'
  const id = !info
    ? undefined
    : live
      ? q.live.current && `live:${q.live.current}\n${info.title}`
      : q.item && `track:${q.item}`
  return {
    id: id || undefined,
    wantsSound: q.wantsSound,
    notice: info && noticeOf(info, live)
  }
}

export interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(t: unknown): void
}

export class SongNotices {
  // The song last settled on, or loaded paused at start: one that starts
  // differs from it. Play on a song loaded at start shows nothing.
  #heard: string | undefined
  // the song waited on, and its wait
  #waiting: string | undefined
  #timer: unknown
  #now: Now = { id: undefined, wantsSound: false, notice: undefined }

  constructor(
    readonly send: (notice: SongNotice) => void,
    // the setting, read when the wait ends
    readonly on: () => boolean,
    readonly timers: Timers
  ) {}

  see(now: Now): void {
    this.#now = now
    const id = now.id
    if (!id) return
    if (!now.wantsSound) {
      this.#heard ??= id
      return
    }
    if (id === this.#waiting) return
    this.#stopWait()
    // back to the song before within the wait (Next, then Previous)
    if (id === this.#heard) return
    this.#waiting = id
    this.#timer = this.timers.set(() => this.#settled(id), settleMs)
  }

  #stopWait(): void {
    if (this.#waiting === undefined) return
    this.timers.clear(this.#timer)
    this.#waiting = undefined
  }

  // Shown if it is still the same song and still playing, with the newest
  // text (a cover that came during the wait).
  #settled(id: string): void {
    this.#waiting = undefined
    this.#heard = id
    const n = this.#now
    if (n.id === id && n.wantsSound && n.notice && this.on()) this.send(n.notice)
  }
}
