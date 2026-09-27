// Moves the position forward while "playing". Ticket 007 replaces it with <audio>.
import { player } from './player.svelte'
import { queue } from './queue.svelte'

export function startFakeClock(): () => void {
  const id = setInterval(() => {
    if (!player.playing) return
    player.pos += 0.25
    if (player.pos >= queue.current.duration) queue.next(true)
  }, 250)
  return () => clearInterval(id)
}
