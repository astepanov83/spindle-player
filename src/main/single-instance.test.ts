import { describe, expect, it } from 'vitest'
import { devRetryData, isDevRetry, takeLock } from './single-instance'

// Free after `busy` asks. Counts the asks and the time waited.
function lock(busy: number): {
  tryLock: (retry: boolean) => boolean
  asks: () => number
  retries: () => number
} {
  let n = 0
  let r = 0
  return {
    tryLock: (retry) => {
      if (retry) r++
      return ++n > busy
    },
    asks: () => n,
    retries: () => r
  }
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
    // only the first ask may bring the running copy to the front
    expect(l.retries()).toBe(3)
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

describe('isDevRetry', () => {
  it('knows the data a waiting dev copy sends', () => {
    expect(isDevRetry(devRetryData)).toBe(true)
    expect(isDevRetry(structuredClone(devRetryData))).toBe(true)
  })

  it('treats anything else as a real second start', () => {
    for (const d of [undefined, null, {}, { devRetry: 'yes' }, 'devRetry', []])
      expect(isDevRetry(d)).toBe(false)
  })
})
