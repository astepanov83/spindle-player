import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IdleTimer, idleMs, mayHide, pageKeeps } from './idle'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const playing = { on: true, playing: true, open: false }

function timer(keeps = (): boolean => false): { t: IdleTimer; seen: boolean[] } {
  const seen: boolean[] = []
  const t = new IdleTimer((h) => seen.push(h), keeps)
  return { t, seen }
}

describe('mayHide', () => {
  it('only with the setting on, playing, and nothing open', () => {
    expect(mayHide(playing)).toBe(true)
    expect(mayHide({ ...playing, on: false })).toBe(false)
    expect(mayHide({ ...playing, playing: false })).toBe(false)
    expect(mayHide({ ...playing, open: true })).toBe(false)
  })
})

describe('IdleTimer', () => {
  it('hides 3 s after it is allowed, not before', () => {
    const { t, seen } = timer()
    t.allow(mayHide(playing))
    vi.advanceTimersByTime(idleMs - 1)
    expect(t.hidden).toBe(false)
    vi.advanceTimersByTime(1)
    expect(t.hidden).toBe(true)
    expect(seen).toEqual([true])
  })

  it('a move shows them at once and the 3 s start over', () => {
    const { t, seen } = timer()
    t.allow(true)
    vi.advanceTimersByTime(idleMs)
    t.poke()
    expect(t.hidden).toBe(false)
    vi.advanceTimersByTime(idleMs - 1)
    expect(t.hidden).toBe(false)
    vi.advanceTimersByTime(1)
    expect(seen).toEqual([true, false, true])
  })

  it('moves keep pushing it back', () => {
    const { t } = timer()
    t.allow(true)
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(idleMs - 500)
      t.poke()
    }
    expect(t.hidden).toBe(false)
  })

  it('never hides while paused, and a pause shows them at once', () => {
    const { t } = timer()
    t.allow(mayHide({ ...playing, playing: false }))
    vi.advanceTimersByTime(idleMs * 3)
    expect(t.hidden).toBe(false)
    t.allow(mayHide(playing))
    vi.advanceTimersByTime(idleMs)
    expect(t.hidden).toBe(true)
    t.allow(mayHide({ ...playing, playing: false }))
    expect(t.hidden).toBe(false)
    t.poke()
    vi.advanceTimersByTime(idleMs * 3)
    expect(t.hidden).toBe(false)
  })

  it('never hides with a menu open; closed, the 3 s start then', () => {
    const { t } = timer()
    t.allow(true)
    vi.advanceTimersByTime(idleMs - 1000)
    t.allow(mayHide({ ...playing, open: true }))
    vi.advanceTimersByTime(idleMs * 3)
    expect(t.hidden).toBe(false)
    t.allow(mayHide(playing))
    vi.advanceTimersByTime(idleMs - 1)
    expect(t.hidden).toBe(false)
    vi.advanceTimersByTime(1)
    expect(t.hidden).toBe(true)
  })

  it('the same answer twice does not start the 3 s over', () => {
    const { t } = timer()
    t.allow(true)
    vi.advanceTimersByTime(idleMs - 1)
    t.allow(true)
    vi.advanceTimersByTime(1)
    expect(t.hidden).toBe(true)
  })

  it('stays while the page keeps them, and waits again on retry', () => {
    let keeps = true
    const { t } = timer(() => keeps)
    t.allow(true)
    vi.advanceTimersByTime(idleMs * 2)
    expect(t.hidden).toBe(false)
    keeps = false
    t.retry()
    vi.advanceTimersByTime(idleMs)
    expect(t.hidden).toBe(true)
  })

  it('retry does not start the 3 s over while waiting', () => {
    const { t } = timer()
    t.allow(true)
    vi.advanceTimersByTime(idleMs - 1)
    t.retry()
    vi.advanceTimersByTime(1)
    expect(t.hidden).toBe(true)
  })

  it('a move while not allowed shows and starts nothing', () => {
    const { t, seen } = timer()
    t.poke()
    vi.advanceTimersByTime(idleMs * 2)
    expect(seen).toEqual([])
  })

  it('stop drops the wait', () => {
    const { t } = timer()
    t.allow(true)
    t.stop()
    vi.advanceTimersByTime(idleMs * 2)
    expect(t.hidden).toBe(false)
  })
})

describe('pageKeeps', () => {
  // an element in the faded parts or not, focused by a key or not
  type Spot = { closest: (s: string) => object | null; matches: (s: string) => boolean }
  const spot = (inFades: boolean, keyFocus = false): Spot => ({
    closest: (s: string) => (s === '[data-fades]' && inFades ? {} : null),
    matches: (s: string) => s === ':focus-visible' && keyFocus
  })
  const base = { pointerAt: null, focused: null, windowFocused: true, dialogOpen: false }

  it('nothing on the controls: they may go', () => {
    expect(pageKeeps(base)).toBe(false)
    expect(pageKeeps({ ...base, pointerAt: spot(false), focused: spot(false, true) })).toBe(false)
  })

  it('the pointer resting on them keeps them', () => {
    expect(pageKeeps({ ...base, pointerAt: spot(true) })).toBe(true)
  })

  it("keyboard focus in them keeps them, a click's focus does not", () => {
    expect(pageKeeps({ ...base, focused: spot(true, true) })).toBe(true)
    expect(pageKeeps({ ...base, focused: spot(true, false) })).toBe(false)
  })

  it('keyboard focus in another window does not', () => {
    expect(pageKeeps({ ...base, focused: spot(true, true), windowFocused: false })).toBe(false)
  })

  it('an open dialog keeps them', () => {
    expect(pageKeeps({ ...base, dialogOpen: true })).toBe(true)
  })
})
