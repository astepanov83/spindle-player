import { describe, expect, it } from 'vitest'
import { emptyHistory, goBack, goForward, leave, mapSteps, maxSteps, type Walk } from './history'

const plain: Walk<string> = { fix: (t) => t, same: (a, b) => a === b }

describe('history', () => {
  it('goes back and forward through the places left', () => {
    let h = leave(leave(emptyHistory<string>(), 'a'), 'b')
    const b1 = goBack(h, 'c', plain)!
    expect(b1.to).toBe('b')
    h = b1.h
    const b2 = goBack(h, 'b', plain)!
    expect(b2.to).toBe('a')
    expect(goBack(b2.h, 'a', plain)).toBeNull()
    const f1 = goForward(b2.h, 'a', plain)!
    expect(f1.to).toBe('b')
    const f2 = goForward(f1.h, 'b', plain)!
    expect(f2.to).toBe('c')
    expect(goForward(f2.h, 'c', plain)).toBeNull()
  })

  it('a new step drops what was ahead', () => {
    const back = goBack(leave(emptyHistory<string>(), 'a'), 'b', plain)!
    const h = leave(back.h, 'a')
    expect(h.ahead).toEqual([])
    expect(goForward(h, 'x', plain)).toBeNull()
  })

  it('skips a place that became the one shown', () => {
    // "b" was an album a rescan removed: what is left of it is the grid
    const w: Walk<string> = { fix: (t) => (t === 'b' ? 'grid' : t), same: plain.same }
    const h = leave(leave(emptyHistory<string>(), 'a'), 'b')
    const r = goBack(h, 'grid', w)!
    expect(r.to).toBe('a')
    expect(r.h.back).toEqual([])
  })

  it('keeps the latest steps only', () => {
    let h = emptyHistory<number>()
    for (let i = 0; i < maxSteps + 5; i++) h = leave(h, i)
    expect(h.back.length).toBe(maxSteps)
    expect(h.back[0]).toBe(5)
  })

  it('mapSteps changes every step and joins repeats', () => {
    const h = { back: ['a', 'p', 'a', 'b'], ahead: ['p'] }
    const out = mapSteps(h, (t) => (t === 'p' ? 'a' : t), plain.same)
    expect(out).toEqual({ back: ['a', 'b'], ahead: ['a'] })
  })
})
