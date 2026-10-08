// The list look's rules (ticket 097): which columns fit, which heading
// stays at the top, and where the keyboard scrolls to. Its rows are a grid
// layout of one item a row (grid-rows.ts). No DOM.
import { rowTop, type GridLayout } from './grid-rows'

// The columns shown of `n` at a width, and whether the first one is said
// under the title instead. As the song table (ticket 043), a narrow list
// drops its columns from the right: the third under 560px, the second under
// 460px, and under 380px the first goes under the title.
export function listColumns(width: number, n: number): { shown: number; under: boolean } {
  if (width < 380) return { shown: 0, under: n > 0 }
  if (width < 460) return { shown: Math.min(n, 1), under: false }
  if (width < 560) return { shown: Math.min(n, 2), under: false }
  return { shown: n, under: false }
}

// The heading held at the top while its rows scroll under it: its row, and
// how far the next heading pushes it up. None while the heading itself is
// still in view. `y`: how far down the list the top of the view is, in px.
export function stuckHead<T>(
  layout: GridLayout<T>,
  y: number,
  headSize: number,
  rowSize: number
): { row: number; shift: number } | undefined {
  const { rows } = layout
  if (y <= 0 || !rows.length) return undefined
  // the last row starting above y
  let lo = 0
  let hi = rows.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (rowTop(layout, mid, headSize, rowSize) < y) lo = mid + 1
    else hi = mid
  }
  const h = layout.headOf(Math.max(0, lo - 1))
  const head = rows[h]
  if (!head || !('head' in head)) return undefined
  // the next group's heading comes right after this group's last row
  const next = layout.rowOf(head.run.end - 1) + 1
  const room =
    next < rows.length ? rowTop(layout, next, headSize, rowSize) - y - headSize : Infinity
  return { row: h, shift: Math.min(0, room) }
}

// The row to scroll to for item i: its heading too when it is the first of
// its group, so Home and the arrows show the heading with it.
export function scrollRow<T>(layout: GridLayout<T>, i: number): number {
  const r = layout.rowOf(i)
  const above = layout.rows[r - 1]
  return above && 'head' in above ? r - 1 : r
}
