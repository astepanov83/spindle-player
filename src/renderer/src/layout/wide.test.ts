import { describe, expect, it } from 'vitest'
import { isWide } from './wide'
import { templates } from '../../../shared/templates'

const { studio, classic, focus } = templates

describe('isWide', () => {
  it('Focus: wide and short windows, from 1.4 times as wide as tall and 900px', () => {
    expect(isWide(focus, 1600, 600)).toBe(true)
    expect(isWide(focus, 1600, 1000)).toBe(true)
    expect(isWide(focus, 1200, 760)).toBe(true)
    expect(isWide(focus, 1400, 1000)).toBe(true)
    expect(isWide(focus, 1399, 1000)).toBe(false)
  })

  it('Focus: tall, square or small windows stay stacked', () => {
    expect(isWide(focus, 440, 680)).toBe(false)
    expect(isWide(focus, 800, 700)).toBe(false)
    expect(isWide(focus, 1000, 1000)).toBe(false)
    // wide enough for the ratio, too narrow for the column beside the stage
    expect(isWide(focus, 899, 560)).toBe(false)
    expect(isWide(focus, 900, 560)).toBe(true)
  })

  it('not before the page is measured', () => {
    expect(isWide(focus, 0, 0)).toBe(false)
    expect(isWide(focus, 1600, 0)).toBe(false)
  })

  it('Studio and Classic have no wide layout', () => {
    expect(isWide(studio, 2400, 800)).toBe(false)
    expect(isWide(classic, 2400, 800)).toBe(false)
  })
})
