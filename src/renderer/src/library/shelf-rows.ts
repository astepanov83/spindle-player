// The shelves look's rules (ticket 098): which tiles of a shelf to draw, how
// far to scroll a shelf to show a tile, and where the arrow keys go. Each
// shelf is an artist's heading over their albums in one line. No DOM.

// A tile and the gap after it, in px
export const shelfStep = 132 + 16
// room each side of the tiles in the shelf, so a focus ring is not cut
export const shelfPad = 4

// The tiles to draw: the ones in view and `extra` each side, so a sideways
// scroll finds them drawn. `left`: the shelf's scrollLeft.
export function shelfWindow(
  left: number,
  width: number,
  n: number,
  extra = 2
): { start: number; end: number } {
  const start = Math.max(0, Math.floor(left / shelfStep) - extra)
  const end = Math.min(n, Math.ceil((left + Math.max(width, 0)) / shelfStep) + extra)
  return { start, end: Math.max(start, end) }
}

// The scrollLeft that shows tile i whole with the room around it, moving
// the shelf as little as it can: the same when it is in view already.
export function shelfLeft(i: number, left: number, width: number): number {
  const start = i * shelfStep
  const end = start + shelfStep - 16 + 2 * shelfPad
  if (start < left) return start
  if (end > left + width) return Math.max(0, end - width)
  return left
}

// A place the focus can be: a shelf and a tile in it, -1 for its heading.
export interface ShelfSpot {
  shelf: number
  at: number
}

// Where a key takes the focus, or null for a key that does nothing here.
// Up and Down go to the shelf above or below, at the same place or its last
// tile; Left and Right go along the shelf, the heading before the first
// tile; Home and End go to its heading and its last tile.
export function shelfMove(
  key: string,
  from: ShelfSpot,
  shelves: number,
  length: (shelf: number) => number
): ShelfSpot | null {
  const along = (at: number): ShelfSpot | null => {
    const to = Math.max(-1, Math.min(at, length(from.shelf) - 1))
    return to === from.at ? null : { shelf: from.shelf, at: to }
  }
  const across = (shelf: number): ShelfSpot | null => {
    if (shelf < 0 || shelf >= shelves) return null
    return { shelf, at: Math.min(from.at, length(shelf) - 1) }
  }
  switch (key) {
    case 'ArrowUp':
      return across(from.shelf - 1)
    case 'ArrowDown':
      return across(from.shelf + 1)
    case 'ArrowLeft':
      return along(from.at - 1)
    case 'ArrowRight':
      return along(from.at + 1)
    case 'Home':
      return along(-1)
    case 'End':
      return along(length(from.shelf) - 1)
  }
  return null
}
