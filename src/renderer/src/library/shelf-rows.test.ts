import { describe, expect, it } from 'vitest'
import { shelfLeft, shelfMove, shelfStep, shelfWindow } from './shelf-rows'

describe('shelfWindow', () => {
  it('draws the tiles in view and two each side', () => {
    // 600px shows tiles 0-4 (the fifth in part)
    expect(shelfWindow(0, 600, 40)).toEqual({ start: 0, end: 7 })
    // scrolled by 10 tiles
    expect(shelfWindow(10 * shelfStep, 600, 40)).toEqual({ start: 8, end: 17 })
  })

  it('stops at the ends of a short shelf', () => {
    expect(shelfWindow(0, 600, 3)).toEqual({ start: 0, end: 3 })
    expect(shelfWindow(0, 600, 0)).toEqual({ start: 0, end: 0 })
    // not measured yet: the first tiles still come
    expect(shelfWindow(0, 0, 10)).toEqual({ start: 0, end: 2 })
  })
})

describe('shelfLeft', () => {
  it('scrolls a tile just into view, from either side', () => {
    // tile 5 is past the right edge of 600px
    expect(shelfLeft(5, 0, 600)).toBe(5 * shelfStep + 132 + 8 - 600)
    // tile 1 is left of the view
    expect(shelfLeft(1, 3 * shelfStep, 600)).toBe(shelfStep)
    // in view already: no move
    expect(shelfLeft(2, 0, 600)).toBe(0)
  })
})

describe('shelfMove', () => {
  // three shelves of 4, 1 and 6 tiles
  const len = (s: number): number => [4, 1, 6][s]

  it('Up and Down keep the place, or go to the last tile of a shorter shelf', () => {
    expect(shelfMove('ArrowDown', { shelf: 0, at: 2 }, 3, len)).toEqual({ shelf: 1, at: 0 })
    expect(shelfMove('ArrowDown', { shelf: 1, at: 0 }, 3, len)).toEqual({ shelf: 2, at: 0 })
    expect(shelfMove('ArrowUp', { shelf: 2, at: 5 }, 3, len)).toEqual({ shelf: 1, at: 0 })
    // the heading stays the heading
    expect(shelfMove('ArrowDown', { shelf: 0, at: -1 }, 3, len)).toEqual({ shelf: 1, at: -1 })
    expect(shelfMove('ArrowUp', { shelf: 0, at: 1 }, 3, len)).toBeNull()
    expect(shelfMove('ArrowDown', { shelf: 2, at: 1 }, 3, len)).toBeNull()
  })

  it('Left and Right go along the shelf, with the heading before its first tile', () => {
    expect(shelfMove('ArrowRight', { shelf: 0, at: -1 }, 3, len)).toEqual({ shelf: 0, at: 0 })
    expect(shelfMove('ArrowRight', { shelf: 0, at: 2 }, 3, len)).toEqual({ shelf: 0, at: 3 })
    expect(shelfMove('ArrowRight', { shelf: 0, at: 3 }, 3, len)).toBeNull()
    expect(shelfMove('ArrowLeft', { shelf: 0, at: 0 }, 3, len)).toEqual({ shelf: 0, at: -1 })
    expect(shelfMove('ArrowLeft', { shelf: 0, at: -1 }, 3, len)).toBeNull()
  })

  it('Home and End go to the heading and the last tile; other keys do nothing', () => {
    expect(shelfMove('Home', { shelf: 2, at: 3 }, 3, len)).toEqual({ shelf: 2, at: -1 })
    expect(shelfMove('End', { shelf: 2, at: 0 }, 3, len)).toEqual({ shelf: 2, at: 5 })
    expect(shelfMove('End', { shelf: 2, at: 5 }, 3, len)).toBeNull()
    expect(shelfMove('Enter', { shelf: 0, at: 0 }, 3, len)).toBeNull()
  })
})
