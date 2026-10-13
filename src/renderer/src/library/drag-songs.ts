// What a drag of songs carries (ticket 089): the songs, their page for an
// empty queue, and the first song's look for the copy under the
// pointer.
import type { ItemKey } from '../../../shared/plugins/items'
import type { QueueLink } from '../../../shared/saved-queue'
import { infoOf } from '../plugins'
import type { DragSongs } from '../stores/song-drag.svelte'

export function dragSongs(
  keys: ItemKey[],
  o: { link?: QueueLink; source?: object } = {}
): DragSongs {
  const t = infoOf(keys[0])
  return { keys, ...o, title: t?.title ?? '', sub: t?.subtitle, art: t?.art }
}
