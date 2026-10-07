// A page's Play and Shuffle buttons (ticket 076): Play is in order and is
// Pause while the queue plays the page's songs, Shuffle plays them shuffled.
// The head block and the playlist page use them.
import type { ItemKey } from '../../../shared/plugins/items'
import type { QueueLink } from '../../../shared/saved-queue'
import { player } from '../stores/player.svelte'
import { queue } from '../stores/queue.svelte'
import { queues } from '../stores/queues.svelte'
import { playOrPause } from './play'

export function playState(
  link: QueueLink | undefined,
  songs: () => ItemKey[]
): 'play' | 'pause' | 'resume' {
  // asked only when the queue came from this page: an artist's or a
  // folder's songs take a while to gather
  let keys: ItemKey[] | undefined
  return playOrPause(link, (k) => (keys ??= songs()).includes(k), {
    link: queue.link,
    current: queue.current,
    ended: queue.ended,
    queuePlays: queues.active === 'track',
    sounding: queues.wantsSound
  })
}

// Play pauses or resumes while the page's songs play, otherwise plays them
// in order from the first one `can` play; Shuffle from a random one of those.
// Either way shuffle is set to match, so the next list plays as it says.
export function playPage(
  how: 'all' | 'shuffle',
  songs: () => ItemKey[],
  from: string,
  link: QueueLink | undefined,
  can: (k: ItemKey) => boolean = () => true
): void {
  if (how === 'all' && playState(link, songs) !== 'play') return queues.togglePlay()
  const keys = songs()
  const ok: number[] = []
  keys.forEach((k, i) => can(k) && ok.push(i))
  if (!ok.length) return
  player.shuffle = how === 'shuffle'
  const at = how === 'shuffle' ? ok[Math.floor(Math.random() * ok.length)] : ok[0]
  queue.playList(keys, at, from, link)
}
