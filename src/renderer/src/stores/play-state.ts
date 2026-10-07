// What plays, as the player bar shows it, for main's tray menu and tooltip
// (ticket 088). Pure, so it is tested; App.svelte sends it on every change.
import type { PlayState } from '../../../shared/ipc'
import type { ItemInfo } from '../plugins/types'
import type { Bar } from '../queue/bar'

// The part of queues this reads.
export interface PlayingNow {
  info: ItemInfo | undefined
  nothingPlaying: boolean
  nothing: boolean
  wantsSound: boolean
  bar: Bar
}

// The names on the bar's second line, without the album: "Artist, Artist",
// a station on air, or a station's "Radio" before its first song.
function names(info: ItemInfo): string {
  return info.names ? info.names.map((n) => n.name).join(', ') : (info.subtitle ?? '')
}

export function playStateOf(q: PlayingNow): PlayState {
  const info = q.nothingPlaying ? undefined : q.info
  return {
    title: info?.title ?? '',
    artist: info ? names(info) : '',
    playing: q.wantsSound,
    live: q.bar.live,
    nothing: q.nothing,
    next: q.bar.next,
    previous: q.bar.previous
  }
}
