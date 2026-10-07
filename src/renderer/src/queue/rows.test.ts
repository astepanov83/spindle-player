import { describe, expect, it } from 'vitest'
import { ROW, clearLabel, followsSong, insertSlotAt, startRow } from './rows'

describe('songs dragged in (ticket 089)', () => {
  // the current song is 2, songs 3 and 4 come after it
  it('go after the current song, never among the played ones', () => {
    expect(insertSlotAt(0, 5, 2)).toBe(3)
    expect(insertSlotAt(3 * ROW, 5, 2)).toBe(3)
    expect(insertSlotAt(4 * ROW - 2, 5, 2)).toBe(4)
    expect(insertSlotAt(5000, 5, 2)).toBe(5)
  })

  it('fill an empty queue', () => {
    expect(insertSlotAt(40, 0, 0)).toBe(0)
  })
})

describe('scrolling on a new song', () => {
  it('shows one song above the new one', () => {
    expect(startRow(4)).toBe(3)
    expect(startRow(0)).toBe(0)
  })

  it('waits a few seconds after the user scrolled', () => {
    expect(followsSong(10_000, 6_000)).toBe(false)
    expect(followsSong(11_000, 6_000)).toBe(true)
  })
})

describe('the Clear button', () => {
  it('says what it takes away', () => {
    expect(clearLabel(5, 1)).toBe('Clear up next')
    expect(clearLabel(5, 4)).toBe('Clear played')
    expect(clearLabel(1, 0)).toBe('Clear queue')
  })
})
