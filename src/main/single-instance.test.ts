import { describe, expect, it } from 'vitest'
import { takeLock } from './single-instance'

// Free after `busy` asks. Counts the asks and the time waited.
function lock(busy: number): { tryLock: () => boolean; asks: () => number } {
  let n = 0
  return { tryLock: () => ++n > busy, asks: () => n }
}

describe('takeLock', () => {
  it('takes a free lock at once, with no wait', async () => {
    const l = lock(0)
    let waited = 0
    const got = await takeLock(l.tryLock, 5000, 250, async (ms) => void (waited += ms))
    expect(got).toBe(true)
    expect(l.asks()).toBe(1)
    expect(waited).toBe(0)
  })

  it('gives up at once when there is no wait (a second copy)', async () => {
    const l = lock(Infinity)
    expect(await takeLock(l.tryLock, 0, 250, async () => {})).toBe(false)
    expect(l.asks()).toBe(1)
  })

  it('asks again while the old copy quits (dev restart)', async () => {
    const l = lock(3)
    let waited = 0
    const got = await takeLock(l.tryLock, 5000, 250, async (ms) => void (waited += ms))
    expect(got).toBe(true)
    expect(l.asks()).toBe(4)
    expect(waited).toBe(750)
  })

  it('gives up after the wait when the other copy stays', async () => {
    const l = lock(Infinity)
    let waited = 0
    const got = await takeLock(l.tryLock, 1000, 250, async (ms) => void (waited += ms))
    expect(got).toBe(false)
    expect(waited).toBe(1000)
    expect(l.asks()).toBe(5)
  })
})
