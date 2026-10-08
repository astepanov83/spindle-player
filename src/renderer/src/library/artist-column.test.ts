import { describe, expect, it } from 'vitest'
import { columnSide, stickTop } from './artist-column'

describe('artist page column (ticket 101)', () => {
  it('beside the songs from 640px of page, on top under it', () => {
    expect(columnSide(1200)).toBe(true)
    expect(columnSide(640)).toBe(true)
    expect(columnSide(639)).toBe(false)
    // Studio's narrow library
    expect(columnSide(408)).toBe(false)
    // not measured yet: beside, as it most likely is
    expect(columnSide(0)).toBe(true)
  })

  it('sticks at the top, or by its bottom when taller than the view', () => {
    expect(stickTop(600, 420)).toBe(0)
    expect(stickTop(600, 600)).toBe(0)
    // the names editor with many names
    expect(stickTop(500, 740)).toBe(-240)
  })
})
