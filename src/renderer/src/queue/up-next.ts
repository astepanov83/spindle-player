// The queue part's lines (ticket 080): the played songs folded into one
// "Played (N)" line or shown in full, then Now playing, then Up next. The
// headings are lines of their own, so the queue stays one virtual list.
import type { ItemAnswer } from '../plugins/types'

export const ROW = 60
export const HEAD = 32

// What the lines are drawn from.
export interface Shape {
  count: number
  // the current song
  current: number
  // the played songs are shown, not folded
  open: boolean
}

export type Line =
  { kind: 'played' } | { kind: 'now' } | { kind: 'next' } | { kind: 'row'; index: number }

// Where things are. `first` is the first song shown; `fold` says there is a
// "Played (N)" line. A drag keeps both while the current song moves.
interface Layout {
  count: number
  current: number
  first: number
  fold: boolean
}

interface Marks {
  // line numbers of the headings; next is -1 when nothing comes after
  now: number
  next: number
  lines: number
}

function layoutOf(s: Shape): Layout {
  return { count: s.count, current: s.current, first: s.open ? 0 : s.current, fold: s.current > 0 }
}

function marks(l: Layout): Marks {
  if (!l.count) return { now: -1, next: -1, lines: 0 }
  const now = (l.fold ? 1 : 0) + l.current - l.first
  const next = l.current < l.count - 1 ? now + 2 : -1
  return { now, next, lines: next < 0 ? now + 2 : next + l.count - l.current }
}

export const firstShown = (s: Shape): number => layoutOf(s).first
export const lineCount = (s: Shape): number => marks(layoutOf(s)).lines

export function lineAt(i: number, s: Shape): Line {
  const l = layoutOf(s)
  const m = marks(l)
  if (l.fold && i === 0) return { kind: 'played' }
  if (i < m.now) return { kind: 'row', index: l.first + i - (l.fold ? 1 : 0) }
  if (i === m.now) return { kind: 'now' }
  if (i === m.now + 1) return { kind: 'row', index: l.current }
  if (i === m.next) return { kind: 'next' }
  return { kind: 'row', index: l.current + i - m.next }
}

function lineOfIn(index: number, l: Layout): number | undefined {
  if (index < l.first || index >= l.count) return undefined
  const m = marks(l)
  if (index < l.current) return (l.fold ? 1 : 0) + index - l.first
  if (index === l.current) return m.now + 1
  return m.next + index - l.current
}

// The line of song `index`; undefined while it is folded away.
export const lineOf = (index: number, s: Shape): number | undefined => lineOfIn(index, layoutOf(s))

function isHead(i: number, l: Layout, m: Marks): boolean {
  return (l.fold && i === 0) || i === m.now || i === m.next
}

function topIn(i: number, l: Layout): number {
  const m = marks(l)
  const heads =
    (l.fold && i > 0 ? 1 : 0) + (i > m.now ? 1 : 0) + (m.next >= 0 && i > m.next ? 1 : 0)
  return heads * HEAD + (i - heads) * ROW
}

export function lineSize(i: number, s: Shape): number {
  const l = layoutOf(s)
  return isHead(i, l, marks(l)) ? HEAD : ROW
}

// Pixels from the top of the list to line `i`.
export const lineTop = (i: number, s: Shape): number => topIn(i, layoutOf(s))

// Where a dragged row lands for each slot (a gap before song `slot`, or the
// end), as the rows look before the drop: the middle of the heading between
// two songs, else the line between them.
function gapAt(slot: number, l: Layout): number {
  if (slot >= l.count) return topIn(marks(l).lines, l)
  const top = topIn(lineOfIn(slot, l)!, l)
  return slot === l.current || slot === l.current + 1 ? top - HEAD / 2 : top
}

// The slot nearest the pointer, `y` pixels from the top of the list. Only
// shown songs make slots; the one above Now playing puts the song with the
// played ones.
export function dropSlotAt(y: number, s: Shape): number {
  const l = layoutOf(s)
  let lo = l.first
  let hi = l.count
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (gapAt(mid, l) < y) lo = mid + 1
    else hi = mid
  }
  if (lo > l.first && y - gapAt(lo - 1, l) < gapAt(lo, l) - y) return lo - 1
  return lo
}

// Where song `i` goes when song `from` moves to `to`.
export function movedTo(i: number, from: number, to: number): number {
  if (i === from) return to
  if (from < to && i > from && i <= to) return i - 1
  if (to < from && i >= to && i < from) return i + 1
  return i
}

// Where the rows and headings stand while a row is dragged: as if it were
// dropped, so the gap opens where it would land and Now playing and Up next
// sit where they will be. The fold stays as it is until the drop.
export interface DragTops {
  row(index: number): number | undefined
  now: number
  next: number | undefined
}

export function dragTops(s: Shape, from: number, to: number): DragTops {
  const l = layoutOf(s)
  const current = movedTo(l.current, from, to)
  const after: Layout = { ...l, current, first: Math.min(l.first, current) }
  const m = marks(after)
  return {
    row(index) {
      const line = lineOfIn(movedTo(index, from, to), after)
      return line === undefined ? undefined : topIn(line, after)
    },
    now: topIn(m.now, after),
    next: m.next < 0 ? undefined : topIn(m.next, after)
  }
}

// The first line to show when a new song starts: the "Played (N)" line while
// folded (Now playing is right under it), else Now playing.
export function startLine(s: Shape): number {
  return s.open ? marks(layoutOf(s)).now : 0
}

// Seconds of quiet after the user scrolled the queue before a new song may
// scroll it again.
export const SCROLL_QUIET = 5000

export function followsSong(now: number, scrolledAt: number): boolean {
  return now - scrolledAt >= SCROLL_QUIET
}

// The scroll position that keeps the same song at the top when the lines
// change under it (a song ended while the user was looking further down).
// A heading at the top counts as the song under it.
export function keepTop(y: number, before: Shape, after: Shape): number {
  const b = layoutOf(before)
  const m = marks(b)
  if (!m.lines) return y
  let line = lineAtY(y, b)
  if (b.fold && line === 0) return y
  if (line === m.now || line === m.next) line++
  const at = lineAt(line, before)
  if (at.kind !== 'row') return y
  const moved = lineOf(at.index, after)
  if (moved === undefined) return y
  return y + lineTop(moved, after) - topIn(line, b)
}

function lineAtY(y: number, l: Layout): number {
  let lo = 0
  let hi = marks(l).lines - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (topIn(mid, l) <= y) lo = mid
    else hi = mid - 1
  }
  return lo
}

// What the Clear button says: it keeps only the song playing, which drops
// the played songs too; with nothing else left it empties the queue.
export function clearLabel(s: Shape): string {
  if (s.current < s.count - 1) return 'Clear up next'
  return s.count > 1 ? 'Clear played' : 'Clear queue'
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
