import { describe, expect, it } from 'vitest'
import { BANDS } from './analysis'
import { SWEEP_MS, idleTarget } from './idle-levels'

const at = (ms: number): Float32Array => {
  const out = new Float32Array(BANDS)
  idleTarget(ms, out)
  return out
}
const loudest = (v: Float32Array): number => v.indexOf(Math.max(...v))

describe('idleTarget', () => {
  it('stays within 0..1', () => {
    for (let ms = 0; ms < 20000; ms += 37)
      for (const v of at(ms)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
  })

  it('is one tone: a single bump, silent away from it', () => {
    const v = at(SWEEP_MS / 4)
    const top = loudest(v)
    expect(v[top]).toBeGreaterThan(0.8)
    v.forEach((x, i) => {
      if (Math.abs(i - top) > 10) expect(x).toBeLessThan(0.01)
    })
  })

  it('goes from bass to treble and back', () => {
    expect(loudest(at(0))).toBe(0)
    expect(loudest(at(SWEEP_MS / 2))).toBe(BANDS - 1)
    expect(loudest(at(SWEEP_MS))).toBe(0)
    expect(loudest(at(SWEEP_MS / 4))).toBeGreaterThan(10)
    expect(loudest(at(SWEEP_MS / 4))).toBeLessThan(BANDS - 10)
  })
})
