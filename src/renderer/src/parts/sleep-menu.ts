// The sleep timer's menu, from the moon on the player bar (ticket 111). In
// Mini main draws it, as a page menu could not go past the 72px bar.
import { pickOf, sleepHeading, sleepRows } from '../queue/sleep'
import { layout } from '../stores/layout.svelte'
import { menu } from '../stores/menu.svelte'
import { player } from '../stores/player.svelte'
import { queues } from '../stores/queues.svelte'
import { sleep } from '../stores/sleep.svelte'

function run(id: string | null): void {
  const p = pickOf(id)
  if (p === null) sleep.cancel()
  else if (p !== undefined) sleep.pick(p)
}

export async function openSleepMenu(e: MouseEvent): Promise<void> {
  const rows = sleepRows(sleep.set, { live: queues.active === 'live', shuffle: player.shuffle })
  if (layout.bar) {
    e.preventDefault()
    run(await window.win.popupMenu(rows))
    return
  }
  menu.showFor(e, [
    { heading: sleepHeading(sleep.set, Date.now()) },
    ...rows.map((r) =>
      r === 'line' ? r : { label: r.label, checked: r.checked, run: () => run(r.id) }
    )
  ])
}
