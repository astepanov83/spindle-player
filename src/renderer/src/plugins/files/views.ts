// For the old views (MFP, the search results) until blocks draw them: which
// song plays, and an album played as the queue.
import type { Track } from '../../../../shared/library'
import { albumLink } from '../../library/album'
import { library } from '../../stores/library.svelte'
import { queues } from '../../stores/queues.svelte'
import { queue } from '../../stores/queue.svelte'
import { trackKey, trackKeys, trackOf } from './tracks'

// The queue's song while it plays, as a library song (for the marks on
// albums and folders).
export function playingTrack(): Track | undefined {
  return trackOf(queues.item)
}

export function isPlaying(t: Track): boolean {
  return queues.item === trackKey(t)
}

// The album page's Play, a tile's play button: the album is the queue.
export function playAlbum(albumId: string, index: number): void {
  const al = library.album(albumId)
  queue.playList(trackKeys(al.trackIds), index, al.title, albumLink(al))
}
