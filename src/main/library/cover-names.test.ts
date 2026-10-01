import { describe, expect, it } from 'vitest'
import {
  badName,
  hashOfName,
  isCoverHash,
  largeName,
  markerOf,
  mosaicHashes,
  mosaicName,
  smallName
} from './cover-names'

const h = 'a'.repeat(40)

describe('cover names', () => {
  it('knows a cover hash', () => {
    expect(isCoverHash(h)).toBe(true)
    expect(isCoverHash('A'.repeat(40))).toBe(false)
    expect(isCoverHash('a'.repeat(39))).toBe(false)
    expect(isCoverHash('../' + 'a'.repeat(37))).toBe(false)
  })

  it('finds the hash of every file the cache writes', () => {
    for (const name of [smallName(h), largeName(h), badName(h), `${largeName(h)}.12.3.tmp`])
      expect(hashOfName(name)).toBe(h)
    expect(hashOfName('notes.txt')).toBeUndefined()
  })

  it('loads small covers and bad markers only', () => {
    expect(markerOf(smallName(h))).toEqual({ hash: h, bad: false })
    expect(markerOf(badName(h))).toEqual({ hash: h, bad: true })
    expect(markerOf(largeName(h))).toBeUndefined()
    expect(markerOf(`${smallName(h)}.1.2.tmp`)).toBeUndefined()
  })

  it('names a mosaic by its 4 covers, and reads them back', () => {
    const four = ['1', '2', '3', '4'].map((c) => c.repeat(40))
    const name = mosaicName(four)
    expect(mosaicHashes(name)).toEqual(four)
    expect(mosaicHashes(`${name}.12.3.tmp`)).toEqual(four)
    expect(hashOfName(name)).toBe(four[0])
    expect(markerOf(name)).toBeUndefined()
    expect(mosaicHashes(smallName(h))).toBeUndefined()
    expect(name.length + '.123456.789.tmp'.length).toBeLessThan(255)
  })
})
