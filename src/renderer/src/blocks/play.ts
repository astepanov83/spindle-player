// What a head's Play button shows and does. No DOM.
import type { ItemKey } from '../../../shared/plugins/items'
import type { QueueLink } from '../../../shared/saved-queue'

// What the queue says.
export interface QueueSide {
  link: QueueLink | undefined
  // the queue's current song
  current: ItemKey | undefined
  // the queue ran out: its last song waits at 0:00
  ended: boolean
  // the queue has the player, not radio
  queuePlays: boolean
  sounding: boolean
}

// A Play that pauses (an album's). While the queue came from this list (its
// link), one of its songs is on and the queue has not run out, it pauses and
// resumes. Else it plays the list from the start: after the end, Play would
// only replay the last song. Add to queue keeps the old link, so the song on
// must be one of these too.
export function playOrPause(
  link: QueueLink | undefined,
  has: (key: ItemKey) => boolean,
  q: QueueSide
): 'play' | 'pause' | 'resume' {
  const ours =
    !!link &&
    q.link?.plugin === link.plugin &&
    q.link.page === link.page &&
    !!q.current &&
    has(q.current)
  if (!q.queuePlays || !ours || q.ended) return 'play'
  return q.sounding ? 'pause' : 'resume'
}
