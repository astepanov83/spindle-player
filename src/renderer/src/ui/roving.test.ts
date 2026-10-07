// The DOM part of roving.ts is checked in the app: the project has no DOM
// library for tests (no jsdom or happy-dom). These are its choices.
import { describe, expect, it } from 'vitest'
import { nearestRow, rowStep, tabStop } from './roving'

describe('tabStop', () => {
  const drawn = [4, 5, 6, 7, 8]
  it('is the row last focused while it is drawn', () => expect(tabStop(drawn, 6, 5, 4)).toBe(6))
  it('is the current song when the row last focused is not drawn or none was', () => {
    expect(tabStop(drawn, 40, 5, 4)).toBe(5)
    expect(tabStop(drawn, null, 5, 4)).toBe(5)
  })
  it('is the first row on screen, else the first drawn', () => {
    expect(tabStop(drawn, null, null, 7)).toBe(7)
    expect(tabStop(drawn, null, 90, null)).toBe(4)
  })
  it('is nothing in an empty list', () => expect(tabStop([], 1, 2, 3)).toBe(undefined))
})

describe('nearestRow', () => {
  it('is the row itself or the closest drawn one', () => {
    expect(nearestRow([10, 11, 12], 11)).toBe(11)
    expect(nearestRow([10, 11, 12], 3)).toBe(10)
    expect(nearestRow([10, 11, 12], 30)).toBe(12)
  })
  it('is nothing in an empty list', () => expect(nearestRow([], 3)).toBe(undefined))
})

describe('rowStep', () => {
  it('moves as in a whole list when every row is shown', () => {
    expect(rowStep('ArrowDown', 3, 0, 10, 4)).toBe(4)
    expect(rowStep('Home', 3, 0, 10, 4)).toBe(0)
    expect(rowStep('End', 3, 0, 10, 4)).toBe(9)
  })

  it('stays in the rows shown when the first ones are folded away', () => {
    expect(rowStep('ArrowUp', 5, 5, 10, 4)).toBe(5)
    expect(rowStep('Home', 8, 5, 10, 4)).toBe(5)
    expect(rowStep('PageUp', 8, 5, 10, 4)).toBe(5)
    expect(rowStep('ArrowDown', 5, 5, 10, 4)).toBe(6)
    expect(rowStep('End', 5, 5, 10, 4)).toBe(9)
    expect(rowStep('a', 5, 5, 10, 4)).toBe(null)
  })
})
