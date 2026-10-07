// When the next song loads and when it is told to play.
import { describe, expect, it } from 'vitest'
import { learnLead, nextMove, preloadSec, targetOverlap, type NextState } from './gapless'

const base: NextState = {
  left: 100,
  loaded: false,
  ready: false,
  playing: true,
  free: true,
  lead: 0.015
}
const at = (s: Partial<NextState>): ReturnType<typeof nextMove> => nextMove({ ...base, ...s })

describe('the next song', () => {
  it('loads once the song playing is near its end, paused too', () => {
    expect(at({ left: preloadSec + 1 })).toEqual({ kind: 'none' })
    expect(at({ left: preloadSec })).toEqual({ kind: 'load' })
    expect(at({ left: 5, playing: false })).toEqual({ kind: 'load' })
  })

  it('a short song loads the next one at once', () => {
    expect(at({ left: 3 })).toEqual({ kind: 'load' })
  })

  it('waits while the other element still sounds out the song before', () => {
    expect(at({ left: 3, free: false })).toEqual({ kind: 'none' })
  })

  it('does nothing until the length is known', () => {
    expect(at({ left: NaN })).toEqual({ kind: 'none' })
  })

  it('looks again a while before the end, then waits out the last bit exactly', () => {
    const far = at({ left: 10, loaded: true, ready: true })
    expect(far).toEqual({ kind: 'wait', ms: 1000 })
    const near = at({ left: 0.5, loaded: true, ready: true })
    expect(near.kind).toBe('wait')
    // stops 50 ms short of the start, for the fine wait
    expect((near as { ms: number }).ms).toBeCloseTo((0.5 - 0.015 - 0.05) * 1000, 6)
    const fine = at({ left: 0.065, loaded: true, ready: true })
    expect((fine as { ms: number }).ms).toBeCloseTo(50, 6)
  })

  it('starts the lead before the end, and past the end too (the join held it back)', () => {
    expect(at({ left: 0.016, loaded: true, ready: true })).toEqual({ kind: 'start' })
    expect(at({ left: -0.01, loaded: true, ready: true })).toEqual({ kind: 'start' })
  })

  it('does not start while paused or not ready', () => {
    expect(at({ left: 0.01, loaded: true, ready: false })).toEqual({ kind: 'none' })
    expect(at({ left: 0.01, loaded: true, ready: true, playing: false })).toEqual({ kind: 'none' })
  })
})

describe('the lead', () => {
  it('moves half way to the overlap aimed at', () => {
    expect(learnLead(0.015, targetOverlap)).toBeCloseTo(0.015, 9)
    // came 30 ms early: start 10 ms later next time
    expect(learnLead(0.015, 0.03)).toBeCloseTo(0.005, 9)
    // came 10 ms late
    expect(learnLead(0.015, -0.01)).toBeCloseTo(0.025, 9)
  })

  it('stays between none and 0.1 s', () => {
    expect(learnLead(0.01, 0.2)).toBe(0)
    expect(learnLead(0.09, -0.5)).toBe(0.1)
  })
})
