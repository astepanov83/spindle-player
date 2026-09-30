import { describe, expect, it } from 'vitest'
import { dropIndex, dropSlot, rowShift } from './drag-rows'

const ROW = 60

describe('dropSlot', () => {
  it('is the gap nearest the pointer: the top half of a row is above it', () => {
    expect(dropSlot(0, ROW, 5)).toBe(0)
    expect(dropSlot(29, ROW, 5)).toBe(0)
    expect(dropSlot(30, ROW, 5)).toBe(1)
    expect(dropSlot(150, ROW, 5)).toBe(3)
  })

  it('stays inside the list', () => {
    expect(dropSlot(-200, ROW, 5)).toBe(0)
    expect(dropSlot(5000, ROW, 5)).toBe(5)
  })
})

describe('dropIndex', () => {
  it('is the row the dragged one ends up at', () => {
    // down: the row itself left a gap above the slot
    expect(dropIndex(0, 3)).toBe(2)
    // up, or no move
    expect(dropIndex(3, 1)).toBe(1)
    expect(dropIndex(2, 2)).toBe(2)
    expect(dropIndex(2, 3)).toBe(2)
  })
})

describe('rowShift', () => {
  it('moves the rows between up when dragging down', () => {
    // row 0 dragged to slot 3: rows 1 and 2 move up
    expect([0, 1, 2, 3, 4].map((i) => rowShift(i, 0, 3, ROW))).toEqual([0, -60, -60, 0, 0])
  })

  it('moves the rows between down when dragging up', () => {
    // row 4 dragged to slot 1: rows 1, 2, 3 move down
    expect([0, 1, 2, 3, 4].map((i) => rowShift(i, 4, 1, ROW))).toEqual([0, 60, 60, 60, 0])
  })

  it('moves nothing when the row is where it was', () => {
    expect([0, 1, 2].map((i) => rowShift(i, 1, 1, ROW))).toEqual([0, 0, 0])
    expect([0, 1, 2].map((i) => rowShift(i, 1, 2, ROW))).toEqual([0, 0, 0])
  })
})
