// For the library's own views (albums, artists, folders, MFP) until they are
// drawn from blocks (ticket 059): their songs as item keys, and which one plays.
import type { Track } from '../../../../shared/library'
import { itemKey, type ItemKey } from '../../../../shared/plugins/items'
import { albumLink } from '../../library/album'
import { library } from '../../stores/library.svelte'
import { queues } from '../../stores/queues.svelte'
import { queue } from '../../stores/queue.svelte'
import { pluginOf } from './tracks'

export function trackKey(t: Track): ItemKey {
  return itemKey(pluginOf(t), t.id)
}

// A song the library doesn't have counts as a file's.
export function trackKeys(ids: string[]): ItemKey[] {
  return ids.map((id) => {
    const t = library.find(id)
    return itemKey(t ? pluginOf(t) : 'files', id)
  })
}

// The library's song for a key of the files or mfp plugin.
export function trackOf(key: ItemKey | undefined): Track | undefined {
  if (!key) return undefined
  const at = key.indexOf(':')
  const t = library.find(key.slice(at + 1))
  return t && pluginOf(t) === key.slice(0, at) ? t : undefined
}

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
