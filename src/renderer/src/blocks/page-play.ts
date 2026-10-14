// A page's Play and Shuffle buttons (ticket 076): Play is in order and is
// Pause while the queue plays the page's songs, Shuffle plays them shuffled.
// The head block and the playlist page use them.
import type { ItemKey } from '../../../shared/plugins/items'
import type { QueueLink } from '../../../shared/saved-queue'
import { player } from '../stores/player.svelte'
import { albumOf, queue } from '../stores/queue.svelte'
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
// in order from the first one `can` play; Shuffle from a random one of those
// (by album: see shuffleStart). `start` plays in order and never pauses.
// Either way shuffle is set to match, so the next list plays as it says.
export function playPage(
  how: 'all' | 'shuffle' | 'start',
  songs: () => ItemKey[],
  link: QueueLink | undefined,
  can: (k: ItemKey) => boolean = () => true
): void {
  if (how === 'all' && playState(link, songs) !== 'play') return queues.togglePlay()
  const keys = songs()
  const ok: number[] = []
  keys.forEach((k, i) => can(k) && ok.push(i))
  if (!ok.length) return
  player.shuffle = how === 'shuffle'
  let at = ok[0]
  if (how === 'shuffle') {
    const s = shuffleStart(keys, ok, albumOf, player.shuffleBy === 'albums')
    if (!s.byAlbum) player.shuffleBy = 'songs'
    at = s.at
  }
  queue.playList(keys, at, link)
}

// Where Shuffle starts: a random one of the rows `ok`, or with `byAlbum`
// (ticket 125) the first of them of a random album. A list of one album has
// no albums to mix, so it shuffles its songs (byAlbum comes back false).
export function shuffleStart(
  keys: ItemKey[],
  ok: number[],
  album: (key: ItemKey) => string | undefined,
  byAlbum: boolean,
  random = Math.random
): { at: number; byAlbum: boolean } {
  if (byAlbum) {
    const seen = new Set<string | undefined>()
    const firsts = ok.filter((i) => {
      const a = album(keys[i])
      if (a !== undefined && seen.has(a)) return false
      seen.add(a)
      return true
    })
    if (firsts.length > 1) return { at: firsts[Math.floor(random() * firsts.length)], byAlbum }
  }
  return { at: ok[Math.floor(random() * ok.length)], byAlbum: false }
}
