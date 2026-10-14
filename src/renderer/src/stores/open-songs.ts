// Songs given from outside the app (ticket 124). "Open with" and the command
// line replace the queue and play, as foobar2000 and MusicBee do. A drop on
// the window goes to the end of the queue, and plays at once when nothing
// plays (Add to queue's notice says where they went).
import type { ItemKey } from '../../../shared/plugins/items'
import { player } from './player.svelte'
import { queue } from './queue.svelte'

// What it needs of the queue and the player, handed in so a test can fake them.
export interface OpenTo {
  queue: Pick<typeof queue, 'items' | 'playList' | 'append' | 'jump'>
  playing(): boolean
}

const real: OpenTo = { queue, playing: () => player.playing }

export function openSongs(keys: ItemKey[], how: 'play' | 'add', to: OpenTo = real): void {
  if (!keys.length) return
  if (how === 'play') return to.queue.playList(keys, 0)
  const playing = to.playing()
  const at = to.queue.items.length
  to.queue.append(keys)
  if (!playing) to.queue.jump(at)
}
