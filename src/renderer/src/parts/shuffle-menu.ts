// Shuffle's menu, from a right click on the player bar's Shuffle (ticket 125):
// off, songs or albums. A press on the button turns on the one picked last.
import { shuffleLabel, shuffleModes } from '../../../shared/shuffle'
import { menu } from '../stores/menu.svelte'
import { setShuffle, shuffleMode } from '../stores/player.svelte'

export function openShuffleMenu(e: MouseEvent): void {
  const now = shuffleMode()
  menu.showFor(e, [
    { heading: 'Shuffle' },
    ...shuffleModes.map((m) => ({
      label: shuffleLabel(m),
      checked: m === now,
      run: () => setShuffle(m)
    }))
  ])
}
