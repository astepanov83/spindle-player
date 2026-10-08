import { describe, expect, it } from 'vitest'
import { fallbackPalettes } from '../../../shared/palette'
import { inksOf } from './colors'
import { hashOf, type Drawing } from './drawing'
import { families } from './genre'
import { drawFamily, drawGenre } from './genre-art'
import { buckets, pictureKey } from './pictures'
import { fakeCtx } from './test-ctx'

const drawing = (seed: string, extra: Partial<Drawing> = {}): Drawing => ({
  inks: inksOf(fallbackPalettes(seed), 'dark'),
  hash: hashOf(seed),
  lengths: [],
  title: seed,
  artist: '',
  small: false,
  ...extra
})

// every color a drawing sets, in order
function colorsOf(draw: (x: never, d: Drawing) => void, d: Drawing): string[] {
  const { x } = fakeCtx()
  const seen: string[] = []
  const spy = new Proxy(x, {
    set: (t, k: string, v) => {
      if (k === 'fillStyle' || k === 'strokeStyle') seen.push(String(v))
      ;(t as unknown as Record<string, unknown>)[k] = v
      return true
    }
  })
  draw(spy as never, d)
  return seen
}

describe('genre drawings', () => {
  for (const family of families)
    for (const small of [false, true])
      it(`${family}${small ? ' (small)' : ''}: draws, the same every time`, () => {
        const a = colorsOf(drawFamily(family), drawing('album-1', { small }))
        expect(a.length).toBeGreaterThan(1)
        expect(colorsOf(drawFamily(family), drawing('album-1', { small }))).toEqual(a)
      })

  it('draws with fewer marks at a small size', () => {
    for (const family of ['rock', 'electronic', 'folk'] as const) {
      const big = colorsOf(drawFamily(family), drawing('album-1')).length
      const small = colorsOf(drawFamily(family), drawing('album-1', { small: true })).length
      expect(small).toBeLessThan(big)
    }
  })

  it('picks the family from the genre tag', () => {
    const d = (genre?: string): string[] => colorsOf(drawGenre, drawing('album-1', { genre }))
    expect(d('Rock')).toEqual(colorsOf(drawFamily('rock'), drawing('album-1')))
    expect(d('Rock')).not.toEqual(d('Jazz'))
    expect(d('Soundtrack')).toEqual(d(undefined))
    expect(d(undefined)).toEqual(colorsOf(drawFamily('none'), drawing('album-1')))
  })

  it('makes other details for another seed, in the same family', () => {
    const a = colorsOf(drawFamily('rock'), drawing('album-1'))
    const b = colorsOf(drawFamily('rock'), drawing('album-2'))
    expect(a).not.toEqual(b)
  })

  it('keeps one picture for all the tags of a family, and another for each family', () => {
    const key = (genre?: string): string =>
      pictureKey('genre', { seed: 's', genre }, 'dark', buckets[1])
    expect(key('Rock')).toBe(key('Heavy Metal'))
    expect(key('Rock')).not.toBe(key('Jazz'))
    expect(key(undefined)).toBe(key('Soundtrack'))
  })
})
