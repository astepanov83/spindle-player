import { describe, expect, it } from 'vitest'
import type { ItemAnswer } from '../plugins/types'
import { ROW, clearLabel, followsSong, insertSlotAt, showsCover, startRow } from './rows'

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
