// The system's media controls (media keys, MPRIS on Linux) go through Chromium's
// media session. Without handlers Chromium would play or pause the element
// itself; with them, the queue decides, and Next and Previous work too.
import type { Album, Track } from '../../../shared/library'
import { CoverBlob, fetchBlob } from './cover-blob'
import { paletteTile, tileKey } from './cover-tile'
import { pause, play, player, seek } from './player.svelte'
import { queue } from './queue.svelte'

export function setupMediaSession(): void {
  const ms = navigator.mediaSession
  if (!ms) return
  ms.setActionHandler('play', () => play())
  ms.setActionHandler('pause', () => pause())
  ms.setActionHandler('nexttrack', () => queue.next())
  ms.setActionHandler('previoustrack', () => queue.prev())
  ms.setActionHandler('seekto', (d) => {
    if (d.seekTime !== undefined) seek(d.seekTime)
  })
}

const covers = new CoverBlob({
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url)
})
// counts calls, so a cover that comes late for an older song is not shown
let shown = 0

// The text goes at once; the picture follows when it is fetched or drawn.
// A song with no cover gets a tile in its album's colors: with no picture,
// Chromium would keep showing the last one it had.
export function showInMediaSession(t: Track | undefined, al: Album | undefined): void {
  const ms = navigator.mediaSession
  if (!ms) return
  const n = ++shown
  if (!t) {
    ms.metadata = null
    return
  }
  const text = { title: t.title, artist: t.artist, album: t.album }
  ms.metadata = new MediaMetadata(text)
  if (!al) return
  const url = al.coverLarge
  const tile = al.palette.dark
  const art = url
    ? covers.load(url, () => fetchBlob(url))
    : covers.load(tileKey(tile), () => paletteTile(tile))
  void art.then((art) => {
    if (art && n === shown) ms.metadata = new MediaMetadata({ ...text, artwork: [art] })
  })
}

export function showStateInMediaSession(): void {
  if (!navigator.mediaSession) return
  navigator.mediaSession.playbackState = queue.current
    ? player.playing
      ? 'playing'
      : 'paused'
    : 'none'
}

// Without this, Chromium tells the system the element's own time and length,
// which for a track of a disc image is the whole image.
export function showPositionInMediaSession(pos: number, duration: number): void {
  const ms = navigator.mediaSession
  if (!ms?.setPositionState) return
  try {
    if (!queue.current || !(duration > 0)) ms.setPositionState()
    else ms.setPositionState({ duration, position: Math.min(pos, duration), playbackRate: 1 })
  } catch {
    // a bad value must not stop the page; the next update tries again
  }
}
