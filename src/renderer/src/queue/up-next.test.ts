import { describe, expect, it } from 'vitest'
import type { ItemAnswer } from '../plugins/types'
import {
  HEAD,
  ROW,
  clearLabel,
  dragTops,
  dropSlotAt,
  firstShown,
  followsSong,
  keepTop,
  lineAt,
  lineCount,
  lineOf,
  lineSize,
  lineTop,
  movedTo,
  showsCover,
  startLine,
  type Line,
  type Shape
} from './up-next'
import { moveOrder } from './logic'

const lines = (s: Shape): Line[] => Array.from({ length: lineCount(s) }, (_, i) => lineAt(i, s))
const row = (index: number): Line => ({ kind: 'row', index })
const played: Line = { kind: 'played' }
const now: Line = { kind: 'now' }
const next: Line = { kind: 'next' }

describe('the queue’s lines (080)', () => {
  it('folds the played songs into one line above Now playing and Up next', () => {
    const s = { count: 6, current: 2, open: false }
    expect(lines(s)).toEqual([played, now, row(2), next, row(3), row(4), row(5)])
    expect(firstShown(s)).toBe(2)
    expect(lineOf(0, s)).toBe(undefined)
    expect(lineOf(2, s)).toBe(2)
    expect(lineOf(4, s)).toBe(5)
  })

  it('shows the played songs under their line when open', () => {
    const s = { count: 5, current: 2, open: true }
    expect(lines(s)).toEqual([played, row(0), row(1), now, row(2), next, row(3), row(4)])
    expect(firstShown(s)).toBe(0)
    expect(lineOf(1, s)).toBe(2)
    expect(lineOf(3, s)).toBe(6)
  })

  it('has no played line on the first song and no Up next on the last', () => {
    expect(lines({ count: 2, current: 0, open: false })).toEqual([now, row(0), next, row(1)])
    expect(lines({ count: 2, current: 1, open: false })).toEqual([played, now, row(1)])
    expect(lines({ count: 1, current: 0, open: true })).toEqual([now, row(0)])
    expect(lines({ count: 0, current: 0, open: false })).toEqual([])
  })

  it('gives headings their own height and adds up the tops', () => {
    const s = { count: 4, current: 1, open: true }
    // played, row 0, now, row 1, next, row 2, row 3
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => lineSize(i, s))).toEqual([
      HEAD,
      ROW,
      HEAD,
      ROW,
      HEAD,
      ROW,
      ROW
    ])
    expect(lineTop(0, s)).toBe(0)
    expect(lineTop(1, s)).toBe(HEAD)
    expect(lineTop(3, s)).toBe(2 * HEAD + ROW)
    expect(lineTop(6, s)).toBe(3 * HEAD + 3 * ROW)
    expect(lineTop(7, s)).toBe(3 * HEAD + 4 * ROW)
  })
})

describe('dragging a row', () => {
  const s = { count: 5, current: 1, open: true }
  // played 0-32, row 0 32-92, now 92-124, row 1 124-184, next 184-216, row 2 216-276, row 3, row 4

  it('drops between rows as before, and on a heading next to the current song', () => {
    expect(dropSlotAt(0, s)).toBe(0)
    expect(dropSlotAt(100, s)).toBe(1)
    expect(dropSlotAt(200, s)).toBe(2)
    expect(dropSlotAt(250, s)).toBe(3)
    expect(dropSlotAt(9999, s)).toBe(5)
  })

  it('drops only among the songs shown; above Now playing joins the played ones', () => {
    const folded = { count: 5, current: 2, open: false }
    expect(dropSlotAt(0, folded)).toBe(2)
    expect(dropSlotAt(-50, folded)).toBe(2)
  })

  it('moves the rows between and keeps the headings by the current song', () => {
    expect([0, 1, 2, 3, 4].map((i) => movedTo(i, [3], 1))).toEqual([0, 2, 3, 1, 4])
    expect([0, 1, 2, 3, 4].map((i) => movedTo(i, [1], 4))).toEqual([0, 3, 1, 2, 4])
    // row 3 goes right after the current song: the current song stays put
    const after = dragTops(s, [3], 2)
    expect(after.now).toBe(lineTop(2, s))
    expect(after.row(1)).toBe(lineTop(3, s))
    expect(after.next).toBe(lineTop(4, s))
    expect(after.row(3)).toBe(lineTop(5, s))
    expect(after.row(2)).toBe(lineTop(6, s))
    // the current song moved down two: two rows join the played ones above it
    const down = dragTops(s, [1], 4)
    expect(down.row(2)).toBe(HEAD + ROW)
    expect(down.row(3)).toBe(HEAD + 2 * ROW)
    expect(down.now).toBe(HEAD + 3 * ROW)
    expect(down.row(1)).toBe(2 * HEAD + 3 * ROW)
    expect(down.next).toBe(2 * HEAD + 4 * ROW)
  })
})

describe('dragging several rows (ticket 086)', () => {
  it('moves them as one block, as moveOrder does', () => {
    const order = moveOrder(6, [1, 4], 3)
    const place = order.map((_, j) => j)
    order.forEach((old, j) => (place[old] = j))
    expect([0, 1, 2, 3, 4, 5].map((i) => movedTo(i, [1, 4], 3))).toEqual(place)
    expect([0, 1, 2, 3, 4, 5].map((i) => movedTo(i, [0, 5], 6))).toEqual([4, 0, 1, 2, 3, 5])
  })

  it('places the rows and headings as if dropped', () => {
    // Played, a/0, a/1, Now playing, a/2, Up next, a/3, a/4, a/5
    const s = { count: 6, current: 2, open: true }
    // a/4 and a/5 go right after the current song
    const t = dragTops(s, [4, 5], 3)
    expect([t.now, t.next]).toEqual([lineTop(3, s), lineTop(5, s)])
    expect([4, 5, 3].map((i) => t.row(i))).toEqual([6, 7, 8].map((l) => lineTop(l, s)))
    // a/0 and a/4 go after a/2: the current song moves up one, with one
    // played row left above it
    const u = dragTops(s, [0, 4], 3)
    expect(u.row(1)).toBe(HEAD)
    expect([u.now, u.row(2), u.next]).toEqual([HEAD + ROW, 2 * HEAD + ROW, 2 * HEAD + 2 * ROW])
    const below = 3 * HEAD + 2 * ROW
    expect([0, 4, 3, 5].map((i) => u.row(i))).toEqual([0, 1, 2, 3].map((k) => below + k * ROW))
  })
})

describe('scrolling on a new song', () => {
  it('shows the top of the list while folded, else Now playing', () => {
    expect(startLine({ count: 9, current: 4, open: false })).toBe(0)
    expect(startLine({ count: 9, current: 4, open: true })).toBe(5)
  })

  it('waits a few seconds after the user scrolled', () => {
    expect(followsSong(10_000, 6_000)).toBe(false)
    expect(followsSong(11_000, 6_000)).toBe(true)
  })

  it('keeps the song at the top in place when one more song folds away', () => {
    const before = { count: 20, current: 2, open: false }
    const after = { count: 20, current: 3, open: false }
    // row 10 is at the top: its line moves up by one row
    const y = lineTop(lineOf(10, before)!, before)
    expect(keepTop(y, before, after)).toBe(lineTop(lineOf(10, after)!, after))
    expect(keepTop(y + 7, before, after)).toBe(lineTop(lineOf(10, after)!, after) + 7)
    // the top of the list stays the top
    expect(keepTop(0, before, after)).toBe(0)
  })
})

describe('the Clear button', () => {
  it('says what it takes away', () => {
    expect(clearLabel({ count: 5, current: 1, open: false })).toBe('Clear up next')
    expect(clearLabel({ count: 5, current: 4, open: false })).toBe('Clear played')
    expect(clearLabel({ count: 1, current: 0, open: false })).toBe('Clear queue')
  })
})

describe('covers on rows', () => {
  const song = (cover: string, no?: number, group = 'A'): ItemAnswer => ({
    state: 'ok',
    info: { title: 't', group, no, art: { cover, coverLarge: '', palette: {} as never } }
  })

  it('shows a cover only where it differs from the row above', () => {
    expect(showsCover(song('a', 2), song('a', 1), false)).toBe(false)
    expect(showsCover(song('b', 1), song('a', 5), false)).toBe(true)
    expect(showsCover(song('a', 1), undefined, false)).toBe(true)
  })

  it('keeps the cover on the current song, a song with no number and a greyed one', () => {
    expect(showsCover(song('a', 2), song('a', 1), true)).toBe(true)
    expect(showsCover(song('a'), song('a', 1), false)).toBe(true)
    expect(showsCover({ state: 'loading' }, song('a', 1), false)).toBe(true)
  })

  it('tells albums with no cover apart by their name', () => {
    expect(showsCover(song('', 2, 'A'), song('', 1, 'A'), false)).toBe(false)
    expect(showsCover(song('', 1, 'B'), song('', 9, 'A'), false)).toBe(true)
  })
})
