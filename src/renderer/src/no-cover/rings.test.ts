import { describe, expect, it } from 'vitest'
import { fallbackPalettes } from '../../../shared/palette'
import { inksOf } from './colors'
import { fakeCtx } from './test-ctx'
import { angleOf, drawRings, patternOf, patterns, ringsOf } from './rings'

const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0)

describe('ringsOf', () => {
  it('gives one ring per track, outer first, widths following the lengths', () => {
    const rings = ringsOf([300, 150, 450])
    expect(rings).toHaveLength(3)
    const [a, b, c] = rings.map((r) => r.width)
    expect(a / b).toBeCloseTo(2)
    expect(c / b).toBeCloseTo(3)
    for (let i = 1; i < rings.length; i++) expect(rings[i].r).toBeLessThan(rings[i - 1].r)
  })

  it('has widths and gaps that add up to the grooved part, with no overlap', () => {
    for (const lengths of [[300, 150, 450], [60], Array.from({ length: 40 }, (_, i) => 100 + i)]) {
      const rings = ringsOf(lengths)
      const outer = rings[0].r + rings[0].width / 2
      const last = rings.at(-1)!
      const inner = last.r - last.width / 2
      expect(outer).toBeCloseTo(44.5)
      expect(inner).toBeCloseTo(21)
      const gaps = rings
        .slice(1)
        .map((r, i) => rings[i].r - rings[i].width / 2 - (r.r + r.width / 2))
      for (const g of gaps) expect(g).toBeGreaterThan(0)
      expect(sum(rings.map((r) => r.width)) + sum(gaps)).toBeCloseTo(23.5)
    }
  })

  it('keeps most of the room for the rings on a long album', () => {
    const rings = ringsOf(Array.from({ length: 40 }, () => 200))
    expect(sum(rings.map((r) => r.width))).toBeGreaterThan(23.5 * 0.7)
  })

  it('gives a station, or a song of no length, one full ring', () => {
    for (const lengths of [[], [0], [180]]) {
      const rings = ringsOf(lengths)
      expect(rings).toHaveLength(1)
      expect(rings[0].width).toBeCloseTo(23.5)
    }
    // tracks of no length share the room
    expect(ringsOf([0, 0]).map((r) => r.width)).toEqual([11.25, 11.25])
  })
})

describe('drawRings', () => {
  const drawing = {
    inks: inksOf(fallbackPalettes('a'), 'dark'),
    hash: 12345,
    lengths: [200, 100],
    title: 'Blue Hours',
    artist: 'Marina Vale'
  }

  it('strokes each ring at its width, then the fine grooves on a big picture', () => {
    const { x, drawn } = fakeCtx()
    drawRings(x, { ...drawing, small: false })
    const widths = ringsOf([200, 100]).map((r) => r.width)
    expect(drawn.strokes.slice(0, 2)).toEqual(widths)
    expect(drawn.strokes.length).toBeGreaterThan(10)
  })

  it('leaves the grooves off a small one', () => {
    const { x, drawn } = fakeCtx()
    drawRings(x, { ...drawing, small: true })
    expect(drawn.strokes).toHaveLength(2)
  })

  it('picks every label pattern and many angles from the seed', () => {
    const seen = new Set<string>()
    const angles = new Set<number>()
    for (let h = 0; h < 1 << 20; h += 4099) {
      seen.add(patternOf(h * 2654435761))
      angles.add(angleOf((h * 2654435761) >>> 0))
    }
    expect([...seen].sort()).toEqual([...patterns].sort())
    expect(angles.size).toBeGreaterThan(90)
  })
})
