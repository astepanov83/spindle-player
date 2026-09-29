// The system's media controls (media keys, MPRIS on Linux) go through Chromium's
// media session. Without handlers Chromium would play or pause the element
// itself; with them, the queue or the radio decides, and Next and Previous work
// too. On the radio they step through My stations.
import type { Art } from '../../../shared/library'
import { CoverBlob, fetchBlob } from './cover-blob'
import { paletteTile, tileKey } from './cover-tile'
import { player } from './player.svelte'
import { playing, type MediaText, type PlayingKind } from './playing.svelte'

export function setupMediaSession(): void {
  const ms = navigator.mediaSession
  if (!ms) return
  ms.setActionHandler('play', () => playing.play())
  ms.setActionHandler('pause', () => playing.pause())
  ms.setActionHandler('nexttrack', () => void playing.next())
  ms.setActionHandler('previoustrack', () => void playing.prev())
}

// A stream can't be sought, so radio offers no seek.
export function showSeekInMediaSession(kind: PlayingKind): void {
  const ms = navigator.mediaSession
  if (!ms) return
  ms.setActionHandler(
    'seekto',
    kind === 'radio'
      ? null
      : (d) => {
          if (d.seekTime !== undefined) playing.seek(d.seekTime)
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

export function showStateInMediaSession(): void {
  if (!navigator.mediaSession) return
  navigator.mediaSession.playbackState = playing.media
    ? player.playing
      ? 'playing'
      : 'paused'
    : 'none'
}

// Without this, Chromium tells the system the element's own time and length,
// which for a track of a disc image is the whole image. Radio has no position.
export function showPositionInMediaSession(pos: number, duration: number): void {
  const ms = navigator.mediaSession
  if (!ms?.setPositionState) return
  try {
    if (playing.kind === 'radio' || !playing.media || !(duration > 0)) ms.setPositionState()
    else ms.setPositionState({ duration, position: Math.min(pos, duration), playbackRate: 1 })
  } catch {
    // a bad value must not stop the page; the next update tries again
  }
}
