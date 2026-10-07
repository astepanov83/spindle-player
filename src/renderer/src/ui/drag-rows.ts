// Drag to reorder a list of same-height rows. The queue has headings between
// its rows and moves several at once, so it works out its own slots (queue/up-next.ts).
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
