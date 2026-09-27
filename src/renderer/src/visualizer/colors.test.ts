import { describe, expect, it } from 'vitest'
import { barColors, mixHex } from './colors'

describe('mixHex', () => {
  it('mixes per channel', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000')
    expect(mixHex('#ff0000', '#0000ff', 1)).toBe('#0000ff')
  })
})

describe('barColors', () => {
  const p: [string, string, string] = ['#f2a541', '#c8553d', '#2d3047']
  it('dark: accent as is, main lightened', () => {
    expect(barColors(p, false)).toEqual({ c1: '#c8553d', c2: mixHex('#f2a541', '#ffffff', 0.3) })
  })
  it('light: both darkened', () => {
    expect(barColors(p, true)).toEqual({
      c1: mixHex('#c8553d', '#000000', 0.25),
      c2: mixHex('#f2a541', '#000000', 0.3)
    })
  })
})
