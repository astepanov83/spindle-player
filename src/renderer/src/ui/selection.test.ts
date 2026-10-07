import { describe, expect, it } from 'vitest'
import {
  clickSelect,
  keepShown,
  listRows,
  menuSelect,
  movedSelection,
  noneSelected,
  numberRows,
  selectAll,
  selectedInOrder,
  stepSelect,
  type Selection
} from './selection'

const rows = listRows(['a', 'b', 'c', 'd', 'e'])
const plain = { ctrl: false, shift: false }
const ctrl = { ctrl: true, shift: false }
const shift = { ctrl: false, shift: true }
const both = { ctrl: true, shift: true }
const ids = <T>(s: Selection<T>): T[] => [...s.ids].sort()

describe('clickSelect', () => {
  it('a plain click selects nothing and leaves the anchor on the row', () => {
    const s = clickSelect({ ids: new Set(['a', 'b']), anchor: 'a' }, rows, 3, plain)
    expect(ids(s)).toEqual([])
    expect(s.anchor).toBe('d')
  })

  it('Ctrl adds a row, and takes it out again', () => {
    let s = clickSelect(noneSelected<string>(), rows, 1, ctrl)
    s = clickSelect(s, rows, 3, ctrl)
    expect(ids(s)).toEqual(['b', 'd'])
    s = clickSelect(s, rows, 1, ctrl)
    expect(ids(s)).toEqual(['d'])
    expect(s.anchor).toBe('b')
  })

  it('Shift selects from the anchor to the row, either way, and keeps the anchor', () => {
    let s = clickSelect(noneSelected<string>(), rows, 1, plain)
    s = clickSelect(s, rows, 3, shift)
    expect(ids(s)).toEqual(['b', 'c', 'd'])
    // a second Shift+click starts from the same anchor, and replaces the range
    s = clickSelect(s, rows, 0, shift)
    expect(ids(s)).toEqual(['a', 'b'])
    expect(s.anchor).toBe('b')
  })

  it('Shift with nothing to start from selects the row alone', () => {
    const s = clickSelect(noneSelected<string>(), rows, 2, shift)
    expect(ids(s)).toEqual(['c'])
    expect(s.anchor).toBe('c')
  })

  it('Ctrl+Shift adds the range to what is selected', () => {
    let s = clickSelect(noneSelected<string>(), rows, 0, ctrl)
    s = clickSelect(s, rows, 3, ctrl)
    s = clickSelect(s, rows, 4, both)
    expect(ids(s)).toEqual(['a', 'd', 'e'])
  })

  it('a range follows the order shown, so a sorted table selects what is between on screen', () => {
    const byTitle = listRows(['e', 'c', 'a', 'd', 'b'])
    let s = clickSelect(noneSelected<string>(), byTitle, 1, plain)
    s = clickSelect(s, byTitle, 3, shift)
    expect(ids(s)).toEqual(['a', 'c', 'd'])
    // sorted again: the same songs stay selected, the range now starts at "c" where it is
    const byArtist = listRows(['a', 'b', 'c', 'd', 'e'])
    expect(selectedInOrder(s, byArtist)).toEqual(['a', 'c', 'd'])
    expect(ids(clickSelect(s, byArtist, 4, shift))).toEqual(['c', 'd', 'e'])
  })

  it('an anchor no longer shown starts the range at the row clicked', () => {
    const s = clickSelect({ ids: new Set(['z']), anchor: 'z' }, rows, 2, shift)
    expect(ids(s)).toEqual(['c'])
  })
})

describe('stepSelect (Shift+arrows)', () => {
  it('with nothing selected, starts at the row that had focus', () => {
    const s = stepSelect(noneSelected<string>('a'), rows, 2, 3)
    expect(ids(s)).toEqual(['c', 'd'])
    expect(s.anchor).toBe('c')
  })

  it('goes on from the anchor, and back over it', () => {
    let s = stepSelect(noneSelected<string>(), rows, 2, 3)
    s = stepSelect(s, rows, 3, 4)
    expect(ids(s)).toEqual(['c', 'd', 'e'])
    s = stepSelect(s, rows, 4, 1)
    expect(ids(s)).toEqual(['b', 'c'])
  })
})

describe('selectAll, keepShown, selectedInOrder', () => {
  it('Ctrl+A selects every row shown', () => {
    expect(ids(selectAll(noneSelected<string>(), rows))).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids(selectAll(noneSelected<string>(), listRows<string>([])))).toEqual([])
  })

  it('drops what is no longer shown, and keeps the same object when all is', () => {
    const s: Selection<string> = { ids: new Set(['b', 'd']), anchor: 'd' }
    expect(keepShown(s, rows)).toBe(s)
    const fewer = keepShown(s, listRows(['a', 'b', 'c']))
    expect(ids(fewer)).toEqual(['b'])
    expect(fewer.anchor).toBe(undefined)
  })

  it('gives the selected rows in the order shown', () => {
    const s: Selection<string> = { ids: new Set(['d', 'a', 'c']), anchor: 'a' }
    expect(selectedInOrder(s, rows)).toEqual(['a', 'c', 'd'])
  })
})

describe('menuSelect', () => {
  const s: Selection<string> = { ids: new Set(['b', 'd']), anchor: 'b' }
  it('on a selected row: every selected row, in order', () => {
    const m = menuSelect(s, rows, 3)
    expect(m.ids).toEqual(['b', 'd'])
    expect(m.selected).toBe(s)
  })
  it('on another row: that row alone, and nothing stays selected', () => {
    const m = menuSelect(s, rows, 0)
    expect(m.ids).toEqual(['a'])
    expect(ids(m.selected)).toEqual([])
  })
  it('with nothing selected, changes nothing', () => {
    const none = noneSelected<string>('c')
    expect(menuSelect(none, rows, 0).selected).toBe(none)
  })
})

describe('numberRows (the queue)', () => {
  it('selects rows by their place', () => {
    const shown = numberRows(4)
    expect(shown.length).toBe(4)
    expect(shown.at(3)).toBe(3)
    expect(shown.indexOf(2)).toBe(2)
    expect(shown.indexOf(-1)).toBe(-1)
    expect(shown.indexOf(4)).toBe(-1)
    let s = clickSelect(noneSelected<number>(), shown, 1, plain)
    s = clickSelect(s, shown, 2, shift)
    expect(ids(s)).toEqual([1, 2])
    expect(ids(selectAll(s, shown))).toEqual([0, 1, 2, 3])
  })

  it('keeps the same rows selected after they move', () => {
    // rows 1 and 3 went to the top
    const s = movedSelection({ ids: new Set([1, 3]), anchor: 3 }, [1, 3, 0, 2, 4])
    expect(ids(s)).toEqual([0, 1])
    expect(s.anchor).toBe(1)
    // another row moved past them
    expect(ids(movedSelection({ ids: new Set([1, 2]), anchor: 1 }, [3, 0, 1, 2, 4]))).toEqual([
      2, 3
    ])
  })

  it('an array finds the first place of an id', () => {
    expect(listRows(['a', 'b', 'a']).indexOf('a')).toBe(0)
  })
})
