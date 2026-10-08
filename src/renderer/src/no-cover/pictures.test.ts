import { describe, expect, it } from 'vitest'
import { fallbackPalettes } from '../../../shared/palette'
import { styleFor } from './draw'
import { bucketOf, pictureKey, pixelsOf } from './pictures'

describe('size buckets', () => {
  it('puts a box in the smallest bucket it fits, under 64px in the small one', () => {
    expect([36, 44, 63].map(bucketOf)).toEqual([48, 48, 48])
    expect([64, 128].map(bucketOf)).toEqual([128, 128])
    expect([129, 256, 300, 512, 900].map(bucketOf)).toEqual([256, 256, 512, 512, 512])
  })

  it('draws the small bucket at 64 and a sharp screen at up to twice the size', () => {
    expect(pixelsOf(48, 1)).toBe(64)
    expect(pixelsOf(128, 1.5)).toBe(192)
    expect(pixelsOf(512, 3)).toBe(1024)
  })

  it('keys a picture by style, theme, bucket, colors and seed', () => {
    const p = fallbackPalettes('a')
    const art = { seed: 'a', palette: p }
    const keys = new Set([
      pictureKey('rings', art, 'dark', 128),
      pictureKey('type', art, 'dark', 128),
      pictureKey('rings', art, 'light', 128),
      pictureKey('rings', art, 'dark', 256),
      pictureKey('rings', { ...art, seed: 'b' }, 'dark', 128),
      // a logo came with new colors for the same seed
      pictureKey('rings', { ...art, palette: fallbackPalettes('logo') }, 'dark', 128),
      pictureKey('rings', { seed: 'a' }, 'dark', 128),
      // an artist named like an album seed
      pictureKey('rings', art, 'dark', 128, true)
    ])
    expect(keys.size).toBe(8)
  })
})

describe('sound picture keys', () => {
  const art = { seed: 'a', lengths: [200, 300] }

  it('is the rings key until the loudness is in, then changes with it', () => {
    const rings = pictureKey('rings', art, 'dark', 128)
    expect(pictureKey('sound', art, 'dark', 128)).toBe(rings)
    const loud = pictureKey(
      'sound',
      { ...art, loudness: ['A'.repeat(32), 'B'.repeat(32)] },
      'dark',
      128
    )
    expect(loud).not.toBe(rings)
    expect(
      pictureKey('sound', { ...art, loudness: ['A'.repeat(32), 'C'.repeat(32)] }, 'dark', 128)
    ).not.toBe(loud)
    expect(
      pictureKey('sound', { ...art, loudness: ['A'.repeat(32), 'B'.repeat(32)] }, 'dark', 128)
    ).toBe(loud)
  })

  it('draws a station, or tracks that cannot be read, as flat bars', () => {
    expect(styleFor('sound', { seed: 's' })).toBe('sound')
    expect(styleFor('sound', { ...art, loudness: ['', ''] })).toBe('sound')
    expect(styleFor('type', art)).toBe('type')
  })
})
