import { describe, expect, it } from 'vitest'
import { gain } from './volume'

describe('gain', () => {
  it('maps the slider to 0..1 on a curve', () => {
    expect(gain(0)).toBe(0)
    expect(gain(50)).toBe(0.25)
    expect(gain(100)).toBe(1)
  })
  it('keeps out-of-range values in range', () => {
    expect(gain(-10)).toBe(0)
    expect(gain(130)).toBe(1)
  })
})
