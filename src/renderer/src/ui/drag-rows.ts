// Drag to reorder a list of same-height rows. The queue has headings between
// its rows, so it works out its own slots (queue/up-next.ts).
// Positions are in pixels from the top of the list. A slot is a gap between rows, 0..count.

// The gap nearest the pointer: over the top half of a row is above it.
export function dropSlot(y: number, rowSize: number, count: number): number {
  return Math.max(0, Math.min(count, Math.floor(y / rowSize + 0.5)))
}

// The row the dragged one ends up at. Below its old place, the row itself
// no longer takes a place above the slot.
export function dropIndex(from: number, slot: number): number {
  return slot > from ? slot - 1 : slot
}

// Where row `i` goes when the rows `moved` (in order) go together to the
// gap before row `slot` (queue/logic.ts moveOrder). A lookup per row, so a
// drag in 50k songs does not build the whole order on each pointer move.
export function movedTo(i: number, moved: readonly number[], slot: number): number {
  const at = moved.indexOf(i)
  if (at >= 0) return slot - below(moved, slot) + at
  return i - below(moved, i) + (i >= slot ? moved.length : 0)
}

// How many of `rows` (in order) are below `i`.
function below(rows: readonly number[], i: number): number {
  let lo = 0
  let hi = rows.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (rows[mid] < i) lo = mid + 1
    else hi = mid
  }
  return lo
}

// How far row `i` moves to make room while row `from` is over `slot`.
export function rowShift(i: number, from: number, slot: number, rowSize: number): number {
  if (i > from && i < slot) return -rowSize
  if (i < from && i >= slot) return rowSize
  return 0
}

// How far to scroll the list while a row is dragged near the top or bottom
// of the box that scrolls, faster closer to the edge. 0 elsewhere.
export function edgeStep(y: number, top: number, bottom: number, edge = 48): number {
  const up = y - top
  const down = bottom - y
  return up < edge ? -(edge - up) / 3 : down < edge ? (edge - down) / 3 : 0
}
