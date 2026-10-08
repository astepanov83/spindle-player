import { describe, expect, it } from 'vitest'
import type { PictureArt } from '../../../shared/library'
import type { NoCover } from '../../../shared/settings'
import { fallbackPalettes } from '../../../shared/palette'
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

describe('keys after a rescan', () => {
  // the album id is the same after a rescan, so the key must hold what the
  // drawing reads
  const art = {
    seed: 'a',
    lengths: [200, 300],
    title: 'Blue',
    artist: 'Joni'
  }
  const key = (style: NoCover, a: PictureArt, artist = false): string =>
    pictureKey(style, { ...a, seed: 'a' }, 'dark', 128, artist)

  it('changes with what each style draws', () => {
    expect(key('rings', { ...art, lengths: [200, 300, 100] })).not.toBe(key('rings', art))
    expect(key('type', { ...art, title: 'blue' })).not.toBe(key('type', art))
    expect(key('type', { ...art, artist: 'Joni M' })).not.toBe(key('type', art))
    expect(key('rings', { ...art, title: 'Joni M' }, true)).not.toBe(key('rings', art, true))
  })

  it('stays when only what the style does not draw changes', () => {
    expect(key('rings', { ...art, title: 'Other' })).toBe(key('rings', art))
    expect(key('record', { ...art, lengths: [1] })).toBe(key('record', art))
  })
})
