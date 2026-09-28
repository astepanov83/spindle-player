import { describe, expect, it } from 'vitest'
import { eachPaced, Pacer, scanSlow } from './pacer'

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

// Jobs that finish when told to, so the test sees how many run at once.
function jobs(): { job: () => Promise<void>; running: () => number; finishOne: () => void } {
  const open: (() => void)[] = []
  return {
    job: () => new Promise<void>((r) => open.push(r)),
    running: () => open.length,
    finishOne: () => open.shift()?.()
  }
}

describe('Pacer', () => {
  it('runs up to the full count at once when nothing plays', async () => {
    const p = new Pacer(3, 1, false)
    const j = jobs()
    for (let i = 0; i < 5; i++) void p.run(j.job)
    await tick()
    expect(j.running()).toBe(3)
    j.finishOne()
    await tick()
    await tick()
    expect(j.running()).toBe(3)
  })

  it('runs one at a time with a rest after each while a song plays', async () => {
    const rests: number[] = []
    let endRest = (): void => {}
    const p = new Pacer(4, 1, true, (ms) => {
      rests.push(ms)
      return new Promise((r) => (endRest = r))
    })
    p.setSlow(true)
    const j = jobs()
    for (let i = 0; i < 3; i++) void p.run(j.job)
    await tick()
    expect(j.running()).toBe(1)
    await new Promise((r) => setTimeout(r, 300))
    j.finishOne()
    await tick()
    // resting as long as the job took: the next job waits
    expect(rests).toHaveLength(1)
    expect(rests[0]).toBeGreaterThanOrEqual(290)
    expect(j.running()).toBe(0)
    endRest()
    await tick()
    await tick()
    expect(j.running()).toBe(1)
  })

  it('lets waiting jobs start when playback stops', async () => {
    const p = new Pacer(3, 1, false)
    p.setSlow(true)
    const j = jobs()
    for (let i = 0; i < 3; i++) void p.run(j.job)
    await tick()
    expect(j.running()).toBe(1)
    p.setSlow(false)
    await tick()
    expect(j.running()).toBe(3)
  })

  it('frees the slot when a job throws', async () => {
    const p = new Pacer(1, 1, false)
    await expect(p.run(() => Promise.reject(new Error('x')))).rejects.toThrow('x')
    expect(p.busy).toBe(0)
    expect(await p.run(async () => 7)).toBe(7)
  })

  it('rests a short while after a quick job', async () => {
    const rests: number[] = []
    const p = new Pacer(4, 1, true, async (ms) => void rests.push(ms))
    p.setSlow(true)
    await p.run(async () => {})
    expect(rests[0]).toBe(250)
  })
})

describe('eachPaced', () => {
  it('runs every item once', async () => {
    const seen: number[] = []
    await eachPaced([1, 2, 3, 4, 5], new Pacer(2, 1, false), async (n) => {
      await tick()
      seen.push(n)
    })
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5])
  })
})

describe('scanSlow', () => {
  const devs = new Set([10, 20])
  it('is slow only while a song plays from a scanned filesystem', () => {
    expect(scanSlow(false, 10, devs)).toBe(false)
    expect(scanSlow(true, 10, devs)).toBe(true)
    expect(scanSlow(true, 30, devs)).toBe(false)
  })

  it('is slow while playing when the song or the folders are not known yet', () => {
    expect(scanSlow(true, undefined, devs)).toBe(true)
    expect(scanSlow(true, 30, new Set())).toBe(true)
  })
})
