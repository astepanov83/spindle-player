// Focus that was in the queue drawer when a wider window turned it back into
// a Column goes to the same place in the Column, so it is never lost (041).

// the Column's queue part; the drawer's own is inside .drawer
const columnSelector = '.part-queue:not(.drawer .part-queue)'

// Where focus is in the drawer: a row's number, -1 elsewhere in it, null outside it.
export function drawerFocus(): number | null {
  const el = document.activeElement
  if (!el?.closest('.drawer')) return null
  const row = el.closest<HTMLElement>('[data-row]')
  return row?.dataset.index !== undefined ? Number(row.dataset.index) : -1
}

// The virtual list draws its rows a frame or two after it mounts, so this
// tries again for a few frames before it settles for the list's Tab stop.
export function focusColumnQueue(index: number, frames = 6): void {
  requestAnimationFrame(() => {
    const part = document.querySelector<HTMLElement>(columnSelector)
    if (!part) return
    const row =
      index >= 0 ? part.querySelector<HTMLElement>(`[data-row][data-index="${index}"]`) : null
    if (index >= 0 && !row && frames > 0) return focusColumnQueue(index, frames - 1)
    const to =
      row ??
      part.querySelector<HTMLElement>('[data-row][tabindex="0"]') ??
      part.querySelector<HTMLElement>('[data-row], button')
    to?.focus()
  })
}
