// The queue part's rows: one flat list, played songs dimmed above the current
// one. A click never changes where rows are, so the list stays put.
import type { ItemAnswer } from '../plugins/types'
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

// Rows from one album show its cover once: the others show their number in
// its place. The current song keeps its cover (the eq bars go on it), and so
// does a song with no number.
export function coverKey(s: ItemAnswer | undefined): string | undefined {
  if (s?.state !== 'ok') return undefined
  return s.info.art?.cover || `group:${s.info.group ?? ''}`
}

export function showsCover(
  s: ItemAnswer,
  above: ItemAnswer | undefined,
  current: boolean
): boolean {
  if (current || s.state !== 'ok' || !s.info.no) return true
  const key = coverKey(s)
  return key === undefined || key !== coverKey(above)
}
