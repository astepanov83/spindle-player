// The system's media controls (media keys, MPRIS on Linux) go through Chromium's
// media session. Without handlers Chromium would play or pause the element
// itself; with them, the queue decides, and Next and Previous work too.
import type { Album, Track } from '../../../shared/library'
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

export function showInMediaSession(t: Track | undefined, al: Album | undefined): void {
  const ms = navigator.mediaSession
  if (!ms) return
  ms.metadata = t
    ? new MediaMetadata({
        title: t.title,
        artist: t.artist,
        album: t.album,
        artwork: al?.coverLarge ? [{ src: al.coverLarge, type: 'image/jpeg' }] : []
      })
    : null
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
