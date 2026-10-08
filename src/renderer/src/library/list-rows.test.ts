import { describe, expect, it } from 'vitest'
import { listStep } from '../keys'
import { gridLayout, letterRows } from './grid-rows'
import { groupRuns, type Grouping } from './groups'
import { listColumns, scrollRow, stuckHead } from './list-rows'

// items named by their group: 'a1' is in group a
const byFirst: Grouping<string> = {
  heading: (x) => ({ key: x[0], title: x[0].toUpperCase(), letter: x[0].toUpperCase() })
}
const items = ['a1', 'a2', 'a3', 'b1', 'c1', 'c2']
// one item a row: # A, a1, a2, a3, # B, b1, # C, c1, c2
const layout = gridLayout(items, 1, groupRuns(items, byFirst))

describe('listColumns: a narrow list drops columns from the right (043)', () => {
  it("Albums' Year, Songs, Length: Length goes first, then Songs, then the year goes under", () => {
    expect(listColumns(800, 3)).toEqual({ shown: 3, under: false })
    expect(listColumns(560, 3)).toEqual({ shown: 3, under: false })
    expect(listColumns(559, 3)).toEqual({ shown: 2, under: false })
    expect(listColumns(459, 3)).toEqual({ shown: 1, under: false })
    // Studio's narrow library
    expect(listColumns(408, 3)).toEqual({ shown: 1, under: false })
    expect(listColumns(379, 3)).toEqual({ shown: 0, under: true })
  })

  it("Artists' Albums, Songs: Songs goes, then the albums go under the name", () => {
    expect(listColumns(500, 2)).toEqual({ shown: 2, under: false })
    expect(listColumns(459, 2)).toEqual({ shown: 1, under: false })
    expect(listColumns(300, 2)).toEqual({ shown: 0, under: true })
  })

  it('no columns: nothing goes under', () => {
    expect(listColumns(300, 0)).toEqual({ shown: 0, under: false })
  })
})

describe('the rows of a list with headings', () => {
  it('one item a row, each heading row known for the rows under it', () => {
    expect(items.map((_, i) => layout.rowOf(i))).toEqual([1, 2, 3, 5, 7, 8])
    expect([0, 1, 3, 4, 5, 8].map((r) => layout.headOf(r))).toEqual([0, 0, 0, 4, 4, 6])
    expect(gridLayout(items, 1).headOf(2)).toBe(-1)
    expect(letterRows(layout.rows)).toEqual({ A: 0, B: 4, C: 6 })
  })

  it('the arrows move by item, past the heading rows, and show a heading with its first item', () => {
    // a3 is item 2: Down goes to item 3, b1, whose row is past the B heading
    const to = listStep('ArrowDown', 2, items.length, 5)!
    expect(items[to]).toBe('b1')
    expect(layout.rowOf(to)).toBe(5)
    // its row scrolled to is the heading's, so B shows over it
    expect(scrollRow(layout, to)).toBe(4)
    expect(scrollRow(layout, 1)).toBe(2)
    expect(scrollRow(layout, listStep('Home', 4, items.length, 5)!)).toBe(0)
    // without headings, the item's own row
    expect(scrollRow(gridLayout(items, 1), 3)).toBe(3)
  })
})

describe('stuckHead: the heading held at the top', () => {
  // headings 50px, rows 60px: # A at 0, a1 50, a2 110, a3 170, # B 230,
  // b1 280, # C 340, c1 390, c2 450
  const stuck = (y: number): ReturnType<typeof stuckHead> => stuckHead(layout, y, 50, 60)

  it('none at the top, or while the heading is still in view', () => {
    expect(stuck(0)).toBeUndefined()
    expect(stuckHead(gridLayout(items, 1), 200, 50, 60)).toBeUndefined()
  })

  it("the group's heading once it scrolls under, until the next one pushes it up", () => {
    expect(stuck(1)).toEqual({ row: 0, shift: 0 })
    expect(stuck(150)).toEqual({ row: 0, shift: 0 })
    // # B at 230 is 30px under the top: A moves up 20px
    expect(stuck(200)).toEqual({ row: 0, shift: -20 })
    expect(stuck(231)).toEqual({ row: 4, shift: 0 })
    expect(stuck(500)).toEqual({ row: 6, shift: 0 })
  })
})
