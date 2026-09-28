import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fallbackPalettes } from '../../shared/palette'
import { isCrash, judge, outcomeOf, PendingJobs, Slots, type Outcome } from './cover-jobs'

describe('outcomeOf', () => {
  it('marks only a real decode failure as bad', () => {
    const jpg = new Uint8Array([1])
    expect(outcomeOf({ id: 1, jpg })).toEqual({ kind: 'ok', jpg })
    expect(outcomeOf({ id: 1, bad: true })).toEqual({ kind: 'bad' })
    expect(outcomeOf({ id: 1 })).toEqual({ kind: 'retry' })
  })

  it('drops a junk palette from the window', () => {
    const jpg = new Uint8Array([1])
    const junk = { dark: ['red', '#000000', '#000000'], light: 'x' } as never
    expect(outcomeOf({ id: 1, jpg, palette: junk })).toEqual({ kind: 'ok', jpg })
    // nothing good left: nothing is known about the picture
    expect(outcomeOf({ id: 1, palette: junk })).toEqual({ kind: 'retry' })
  })

  it('passes the palette on, with or without a JPEG', () => {
    const jpg = new Uint8Array([1])
    const palette = fallbackPalettes('x')
    expect(outcomeOf({ id: 1, palette })).toEqual({ kind: 'ok', palette })
    expect(outcomeOf({ id: 1, jpg, palette })).toEqual({ kind: 'ok', jpg, palette })
  })
})

describe('PendingJobs', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('hands each answer to its job', async () => {
    const jobs = new PendingJobs(1000, () => {})
    const a = jobs.wait(1)
    const b = jobs.wait(2)
    jobs.settle(2, { kind: 'bad' })
    jobs.settle(1, { kind: 'ok', jpg: new Uint8Array([7]) })
    expect(await a).toEqual({ kind: 'ok', jpg: new Uint8Array([7]) })
    expect(await b).toEqual({ kind: 'bad' })
    expect(jobs.size).toBe(0)
  })

  it('ends every waiting job as retry when the window goes away', async () => {
    const jobs = new PendingJobs(1000, () => {})
    const all = [jobs.wait(1), jobs.wait(2)]
    jobs.failAll()
    expect(await Promise.all(all)).toEqual([{ kind: 'retry' }, { kind: 'retry' }])
  })

  it('ends a stuck job as retry and tells the owner', async () => {
    const onTimeout = vi.fn()
    const jobs = new PendingJobs(1000, onTimeout)
    const a = jobs.wait(1)
    vi.advanceTimersByTime(1000)
    expect(await a).toEqual({ kind: 'retry' })
    expect(onTimeout).toHaveBeenCalledOnce()
    // a late answer is ignored
    jobs.settle(1, { kind: 'bad' })
    expect(jobs.size).toBe(0)
  })
})

describe('isCrash', () => {
  it('counts only a crash or running out of memory', () => {
    expect(isCrash('crashed')).toBe(true)
    expect(isCrash('oom')).toBe(true)
    for (const r of ['killed', 'clean-exit', 'abnormal-exit', 'launch-failed', 'integrity-failure'])
      expect(isCrash(r)).toBe(false)
  })
})

describe('judge', () => {
  const ok: Outcome = { kind: 'ok', jpg: new Uint8Array([1]) }

  it('keeps a good answer and a plain retry', () => {
    expect(judge(ok, false)).toBe(ok)
    expect(judge({ kind: 'retry' }, false)).toEqual({ kind: 'retry' })
    expect(judge({ kind: 'retry' }, true)).toEqual({ kind: 'retry' })
  })

  it('runs a bad or crashed picture again alone before calling it bad', () => {
    expect(judge({ kind: 'bad' }, false)).toBe('alone')
    expect(judge({ kind: 'retry', crash: true }, false)).toBe('alone')
    expect(judge({ kind: 'bad' }, true)).toEqual({ kind: 'bad' })
    expect(judge({ kind: 'retry', crash: true }, true)).toEqual({ kind: 'bad' })
  })
})

describe('PendingJobs.failAll', () => {
  it('tells a crash from a closed window', async () => {
    const jobs = new PendingJobs(1000, () => {})
    const a = jobs.wait(1)
    jobs.failAll(true)
    expect(await a).toEqual({ kind: 'retry', crash: true })
    const b = jobs.wait(2)
    jobs.failAll()
    expect(await b).toEqual({ kind: 'retry' })
  })
})

describe('Slots', () => {
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

  it('never runs more than max, also when a job asks right after one ends', async () => {
    const slots = new Slots(4)
    let running = 0
    let most = 0
    const job = async (): Promise<void> => {
      await slots.take()
      running++
      most = Math.max(most, running)
      await flush()
      running--
      slots.give()
    }
    const jobs = Array.from({ length: 5 }, job)
    // one ends; a new one asks before the waiting one has run
    await new Promise((r) => setTimeout(r, 1))
    jobs.push(job(), job())
    await Promise.all(jobs)
    expect(most).toBe(4)
    expect(slots.busy).toBe(0)
  })

  it('hands a freed slot to the job that waited first', async () => {
    const slots = new Slots(1)
    const order: string[] = []
    await slots.take()
    void slots.take().then(() => order.push('first'))
    void slots.take().then(() => order.push('second'))
    slots.give()
    await flush()
    expect(order).toEqual(['first'])
    expect(slots.busy).toBe(1)
  })

  it('runs a job alone, and holds back the jobs after it', async () => {
    const slots = new Slots(4)
    await slots.take()
    await slots.take()
    let alone = false
    let later = false
    void slots.take(true).then(() => (alone = true))
    void slots.take().then(() => (later = true))
    slots.give()
    await flush()
    expect(alone).toBe(false)
    slots.give()
    await flush()
    expect(alone).toBe(true)
    expect(later).toBe(false)
    expect(slots.busy).toBe(1)
    slots.give()
    await flush()
    expect(later).toBe(true)
  })
})
