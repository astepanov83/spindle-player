import { describe, expect, it } from 'vitest'
import { encodeCurve } from '../../../shared/loudness-text'
import { fallbackPalettes } from '../../../shared/palette'
import { inksOf } from './colors'
import { hashOf, type Drawing } from './drawing'
import { barsOf, drawArtistSound, drawSound } from './sound'
import { fakeCtx } from './test-ctx'

const flat32 = (v: number): number[] => Array.from({ length: 32 }, () => v)

const drawing = (extra: Partial<Drawing> = {}): Drawing => ({
  inks: inksOf(fallbackPalettes('s'), 'dark'),
  hash: hashOf('s'),
  lengths: [200, 300],
  title: 'The Ochre Band',
  artist: '',
  small: false,
  ...extra
})

describe('barsOf', () => {
  it('gives each track places in proportion to its length, with gaps', () => {
    const bars = barsOf([100, 300], [], 132)
    const a = bars.filter((b) => b.track === 0).length
    const b = bars.filter((b) => b.track === 1).length
    expect(a + b).toBe(132 - 2 * 3)
    expect(b / a).toBeCloseTo(3, 0)
    // the last bar of track 0 and the first of track 1 are a gap apart
    const last = bars.filter((x) => x.track === 0).at(-1)!
    const first = bars.find((x) => x.track === 1)!
    expect((first.at - last.at) * 132).toBeCloseTo(4)
  })

  it('follows the curve of a track, so a quiet track is lower than a loud one', () => {
    const bars = barsOf([100, 100], [flat32(0.2), flat32(0.9)], 132)
    const mean = (t: number): number => {
      const l = bars.filter((b) => b.track === t).map((b) => b.level)
      return l.reduce((x, y) => x + y, 0) / l.length
    }
    expect(mean(0)).toBeCloseTo(0.2)
    expect(mean(1)).toBeCloseTo(0.9)
  })

  it('shows a rising curve as bars that rise', () => {
    const rise = Array.from({ length: 32 }, (_, i) => i / 31)
    const levels = barsOf([200], [rise], 132).map((b) => b.level)
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1])
    expect(levels[0]).toBeLessThan(0.1)
    expect(levels.at(-1)).toBeGreaterThan(0.9)
  })

  it('makes flat bars for a station, a track with no curve, and one that is not read', () => {
    for (const bars of [barsOf([], [], 132), barsOf([100, 100], [[], []], 132)]) {
      expect(new Set(bars.map((b) => b.level))).toEqual(new Set([0.45]))
    }
    expect(barsOf([], [], 132)).toHaveLength(132)
  })

  it('never makes more bars than places, even for hundreds of tracks', () => {
    const lengths = Array.from({ length: 400 }, (_, i) => 120 + (i % 7) * 30)
    const bars = barsOf(lengths, [], 132)
    expect(bars.length).toBeLessThanOrEqual(132)
    expect(bars.length).toBeGreaterThan(100)
    const ats = bars.map((b) => b.at)
    expect(ats).toEqual([...ats].sort((a, b) => a - b))
  })

  it('shares the room between tracks of no length', () => {
    const bars = barsOf([0, 0], [], 48, 1)
    expect(bars.filter((b) => b.track === 0).length).toBe(bars.filter((b) => b.track === 1).length)
  })
})

describe('drawSound', () => {
  it('draws about 130 bars, or about 48 on a small picture', () => {
    const count = (small: boolean): number => {
      const { x, drawn } = fakeCtx()
      let moves = 0
      const spy = new Proxy(x, {
        get: (t, k: string) =>
          k === 'moveTo' ? () => moves++ : (t as unknown as Record<string, unknown>)[k]
      })
      drawSound(spy, drawing({ small }))
      expect(drawn.strokes.length).toBeGreaterThan(0)
      return moves
    }
    expect(count(false)).toBeGreaterThan(120)
    expect(count(true)).toBeLessThan(60)
    expect(count(true)).toBeGreaterThan(40)
  })

  it('draws taller bars for a louder album', () => {
    const reach = (v: number): number => {
      const { x } = fakeCtx()
      let far = 0
      const spy = new Proxy(x, {
        get: (t, k: string) =>
          k === 'lineTo'
            ? (px: number, py: number) => (far = Math.max(far, Math.hypot(px - 50, py - 50)))
            : (t as unknown as Record<string, unknown>)[k]
      })
      drawSound(spy, drawing({ loudness: [encodeCurve(flat32(v)), encodeCurve(flat32(v))] }))
      return far
    }
    expect(reach(0.9)).toBeGreaterThan(reach(0.2) + 10)
  })

  it('writes no text; an artist writes their initials in the middle', () => {
    const a = fakeCtx()
    drawSound(a.x, drawing())
    expect(a.drawn.texts).toEqual([])
    const b = fakeCtx()
    drawArtistSound(b.x, drawing())
    expect(b.drawn.texts.map((t) => t.text)).toEqual(['OB'])
  })
})
