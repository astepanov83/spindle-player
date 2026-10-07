// Drag to reorder a list of same-height rows. The queue has headings between
// its rows and works out its own slots (queue/up-next.ts); dropIndex is shared.
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
