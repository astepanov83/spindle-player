// The system's media controls (media keys, MPRIS on Linux) go through Chromium's
// media session. Without handlers Chromium would play or pause the element
// itself; with them, the queue that plays decides, and Next and Previous work
// too. On a live item they ask its plugin (radio: My stations).
import type { Art } from '../../../shared/library'
import { CoverBlob, fetchBlob } from './cover-blob'
import { paletteTile, tileKey } from './cover-tile'
import { queues, type Active, type MediaText } from './queues.svelte'

export function setupMediaSession(): void {
  const ms = navigator.mediaSession
  if (!ms) return
  ms.setActionHandler('play', () => void queues.play())
  ms.setActionHandler('pause', () => queues.pause())
  ms.setActionHandler('nexttrack', () => void queues.next())
  ms.setActionHandler('previoustrack', () => void queues.prev())
}

// A live item can't be sought, so it offers no seek.
export function showSeekInMediaSession(active: Active): void {
  const ms = navigator.mediaSession
  if (!ms) return
  ms.setActionHandler(
    'seekto',
    active === 'live'
      ? null
      : (d) => {
          if (d.seekTime !== undefined) queues.seek(d.seekTime)
        }
  )
}

const covers = new CoverBlob({
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url)
})
// counts calls, so a cover that comes late for an older song is not shown
let shown = 0

// The text goes at once; the picture follows when it is fetched or drawn.
// A song with no cover gets a tile in its colors: with no picture,
// Chromium would keep showing the last one it had.
export function showInMediaSession(text: MediaText | undefined, art: Art | undefined): void {
  const ms = navigator.mediaSession
  if (!ms) return
  const n = ++shown
  if (!text) {
    ms.metadata = null
    return
  }
  ms.metadata = new MediaMetadata(text)
  if (!art) return
  const url = art.coverLarge
  const tile = art.palette.dark
  const image = url
    ? covers.load(url, () => fetchBlob(url))
    : covers.load(tileKey(tile), () => paletteTile(tile))
  void image.then((pic) => {
    if (pic && n === shown) ms.metadata = new MediaMetadata({ ...text, artwork: [pic] })
  })
}

// The wish, as the play button shows it: playing also while a clicked song
// is on its way.
export function showStateInMediaSession(): void {
  if (!navigator.mediaSession) return
  navigator.mediaSession.playbackState = queues.media
    ? queues.wantsSound
      ? 'playing'
      : 'paused'
    : 'none'
}

// Without this, Chromium tells the system the element's own time and length,
// which for a track of a disc image is the whole image. A live item has no position.
export function showPositionInMediaSession(pos: number, duration: number): void {
  const ms = navigator.mediaSession
  if (!ms?.setPositionState) return
  try {
    if (queues.active === 'live' || !queues.media || !(duration > 0)) ms.setPositionState()
    else ms.setPositionState({ duration, position: Math.min(pos, duration), playbackRate: 1 })
  } catch {
    // a bad value must not stop the page; the next update tries again
  }
}
