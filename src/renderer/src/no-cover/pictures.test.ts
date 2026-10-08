import { describe, expect, it } from 'vitest'
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

  it('keys a picture by style, theme, bucket and seed', () => {
    const keys = new Set([
      pictureKey('rings', 'a', 'dark', 128),
      pictureKey('type', 'a', 'dark', 128),
      pictureKey('rings', 'a', 'light', 128),
      pictureKey('rings', 'a', 'dark', 256),
      pictureKey('rings', 'b', 'dark', 128)
    ])
    expect(keys.size).toBe(5)
  })
})
