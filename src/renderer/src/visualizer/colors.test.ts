import { describe, expect, it } from 'vitest'
import type { ThemePalettes } from '../../../shared/palette'
import { barColors, mixHex } from './colors'

describe('mixHex', () => {
  it('mixes per channel', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000')
    expect(mixHex('#ff0000', '#0000ff', 1)).toBe('#0000ff')
  })
})

describe('barColors', () => {
  const p: ThemePalettes = {
    dark: ['#f2a541', '#e0735c', '#2d3047'],
    light: ['#f2a541', '#b8412b', '#2d3047']
  }
  it('dark: the dark accent as is, main lightened', () => {
    expect(barColors(p, false)).toEqual({ c1: '#e0735c', c2: mixHex('#f2a541', '#ffffff', 0.3) })
  })
  it('light: the light accent as is, main darkened', () => {
    expect(barColors(p, true)).toEqual({ c1: '#b8412b', c2: mixHex('#f2a541', '#000000', 0.3) })
  })
})
