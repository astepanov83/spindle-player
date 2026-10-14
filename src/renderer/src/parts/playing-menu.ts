// The song menu of what plays, on a right click of its title (Now playing,
// the bar): as the queue's row of it, so Song info is a click away (ticket
// 127). Nothing for a station: it has no song menu. Nothing in Mini, whose
// right click is its own menu from main.
import { openSongMenu } from '../library/song-menu'
import { layout } from '../stores/layout.svelte'
import { queue } from '../stores/queue.svelte'
import { queues } from '../stores/queues.svelte'

export function openPlayingMenu(e: MouseEvent): void {
  const key = queues.item
  if (layout.bar || !key || queue.items[queue.index] !== key) return
  openSongMenu(e, [key], { queueRows: [queue.index] })
}
