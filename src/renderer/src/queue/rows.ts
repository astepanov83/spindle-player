// The queue part's rows: one flat list, played songs dimmed above the current
// one. A click never changes where rows are, so the list stays put.
import { dropSlot } from '../ui/drag-rows'

export const ROW = 60

// Songs dragged in from the library (ticket 089) go after the current song:
// the gap nearest the pointer, `y` pixels from the top of the list, but none
// among the played ones.
export function insertSlotAt(y: number, count: number, current: number): number {
  if (!count) return 0
  return Math.max(current + 1, dropSlot(y, ROW, count))
}

// The row to put at the top when a new song starts: one above it, so the
// song before shows too.
export const startRow = (current: number): number => Math.max(0, current - 1)

// Seconds of quiet after the user scrolled the queue before a new song may
// scroll it again.
export const SCROLL_QUIET = 5000

export function followsSong(now: number, scrolledAt: number): boolean {
  return now - scrolledAt >= SCROLL_QUIET
}

// What the Clear button says: it keeps only the song playing, which drops
// the played songs too; with nothing else left it empties the queue.
export function clearLabel(count: number, current: number): string {
  if (current < count - 1) return 'Clear up next'
  return count > 1 ? 'Clear played' : 'Clear queue'
}
