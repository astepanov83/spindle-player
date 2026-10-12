// The sleep timer with a fake clock and a fake engine: when the fade starts,
// the pause at the end, and the volume back after it or after Cancel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])
vi.mock('../audio/engine', () => ({
  engine: {
    fadeOut: (s: number) => calls.push(`fade ${s}`),
    unfade: (delay = 0) => calls.push(`unfade ${delay}`)
  }
}))

const { sleep } = await import('./sleep.svelte')

const min = 60_000

beforeEach(() => {
  vi.useFakeTimers()
  sleep.cancel()
  calls.length = 0
  sleep.pause = () => calls.push('pause')
  sleep.replan = () => calls.push('replan')
})

afterEach(() => {
  sleep.cancel()
  vi.useRealTimers()
})

describe('a timed timer', () => {
  it('fades over its last 20 s, then pauses and puts the volume back', () => {
    sleep.pick(15)
    expect(sleep.shown).toEqual({ pick: 15, left: '15m' })
    vi.advanceTimersByTime(15 * min - 21_000)
    expect(calls).toEqual(['replan'])
    vi.advanceTimersByTime(1000)
    expect(calls).toEqual(['replan', 'fade 20'])
    expect(sleep.shown?.left).toBe('20s')
    vi.advanceTimersByTime(19_000)
    expect(calls).toEqual(['replan', 'fade 20'])
    vi.advanceTimersByTime(1000)
    expect(calls).toEqual(['replan', 'fade 20', 'pause', 'unfade 0.5'])
    expect(sleep.set).toBeUndefined()
    // and nothing more
    vi.advanceTimersByTime(10 * min)
    expect(calls).toHaveLength(4)
  })

  it('counts the time left down by the minute', () => {
    sleep.pick(30)
    vi.advanceTimersByTime(7 * min)
    expect(sleep.shown?.left).toBe('23m')
  })

  it('Cancel in the fade brings the volume back at once, and nothing pauses', () => {
    sleep.pick(15)
    vi.advanceTimersByTime(15 * min - 10_000)
    sleep.cancel()
    expect(calls).toEqual(['replan', 'fade 20', 'unfade 0', 'replan'])
    vi.advanceTimersByTime(20_000)
    expect(calls).not.toContain('pause')
    expect(sleep.shown).toBeUndefined()
  })

  it('a new choice starts over, and ends the fade', () => {
    sleep.pick(15)
    vi.advanceTimersByTime(15 * min - 5000)
    sleep.pick(30)
    expect(calls).toEqual(['replan', 'fade 20', 'unfade 0', 'replan'])
    expect(sleep.shown?.left).toBe('30m')
    vi.advanceTimersByTime(10 * min)
    expect(calls).not.toContain('pause')
  })
})

describe('end of song and album', () => {
  it('has no clock: the queue ends it', () => {
    sleep.pick('song')
    expect(sleep.shown).toEqual({ pick: 'song', left: 'song' })
    vi.advanceTimersByTime(120 * min)
    expect(calls).toEqual(['replan'])
    sleep.done()
    expect(sleep.set).toBeUndefined()
    expect(calls).toEqual(['replan', 'replan'])
  })

  it('goes when a live item plays; a timed one stays', () => {
    sleep.pick('album')
    sleep.liveStarted()
    expect(sleep.set).toBeUndefined()
    sleep.pick(45)
    sleep.liveStarted()
    expect(sleep.set).toMatchObject({ pick: 45 })
  })
})
