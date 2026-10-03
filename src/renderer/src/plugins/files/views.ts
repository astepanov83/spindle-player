// For the old MFP views until blocks draw them (ticket 061): the
// song playing, and an album played as the queue.
import type { Track } from '../../../../shared/library'
import { albumLink } from '../../library/album'
import { library } from '../../stores/library.svelte'
import { queues } from '../../stores/queues.svelte'
import { queue } from '../../stores/queue.svelte'
import { trackKey, trackKeys } from './tracks'

export function isPlaying(t: Track): boolean {
  return queues.item === trackKey(t)
}

// An episode's Play and its songs (MFP): the album is the queue.
export function playAlbum(albumId: string, index: number): void {
  const al = library.album(albumId)
  queue.playList(trackKeys(al.trackIds), index, al.title, albumLink(al))
}
