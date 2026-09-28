import { describe, expect, it } from 'vitest'
import { eachPaced, Lane, Pacer, scanSlow } from './pacer'

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
    let clock = 0
    const p = new Pacer(
      4,
      1,
      true,
      (ms) => {
        rests.push(ms)
        return new Promise((r) => (endRest = r))
      },
      () => clock
    )
    p.setSlow(true)
    const j = jobs()
    for (let i = 0; i < 3; i++) void p.run(j.job)
    await tick()
    expect(j.running()).toBe(1)
    clock += 300
    j.finishOne()
    await tick()
    // resting as long as the job took: the next job waits
    expect(rests).toEqual([300])
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
    const p = new Pacer(
      4,
      1,
      true,
      async (ms) => void rests.push(ms),
      () => 0
    )
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

describe('Lane', () => {
  it("runs jobs as they come, in order, up to the pacer's count at once", async () => {
    const lane = new Lane(new Pacer(2, 1, false))
    const j = jobs()
    const started: number[] = []
    for (let i = 0; i < 3; i++)
      lane.push(() => {
        started.push(i)
        return j.job()
      })
    await tick()
    expect(started).toEqual([0, 1])
    j.finishOne()
    await tick()
    await tick()
    expect(started).toEqual([0, 1, 2])
    // a job pushed later still runs
    lane.push(() => {
      started.push(3)
      return j.job()
    })
    j.finishOne()
    await tick()
    await tick()
    expect(started).toEqual([0, 1, 2, 3])
  })

  it('is idle once every job pushed so far ended, also ones pushed by a job', async () => {
    const lane = new Lane(new Pacer(2, 1, false))
    const seen: number[] = []
    lane.push(async () => {
      await tick()
      seen.push(1)
      lane.push(async () => {
        await tick()
        seen.push(2)
      })
    })
    await lane.idle()
    expect(seen).toEqual([1, 2])
    // idle at once with nothing to do
    await lane.idle()
  })

  it('stops at the first error: the rest is dropped and idle rejects with it', async () => {
    const lane = new Lane(new Pacer(1, 1, false))
    const seen: number[] = []
    lane.push(async () => {
      throw new Error('bad')
    })
    lane.push(async () => void seen.push(2))
    await expect(lane.idle()).rejects.toThrow('bad')
    expect(seen).toEqual([])
    expect(() => lane.check()).toThrow('bad')
    lane.push(async () => void seen.push(3))
    await expect(lane.idle()).rejects.toThrow('bad')
    expect(seen).toEqual([])
  })

  it('can be stopped from outside; jobs already running end first', async () => {
    const lane = new Lane(new Pacer(2, 1, false))
    const j = jobs()
    lane.push(j.job)
    lane.push(j.job)
    lane.push(j.job)
    await tick()
    lane.stop(new Error('stopped'))
    let settled = false
    void lane.idle().catch(() => (settled = true))
    await tick()
    expect(settled).toBe(false)
    j.finishOne()
    j.finishOne()
    await tick()
    await tick()
    expect(settled).toBe(true)
    expect(j.running()).toBe(0)
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
