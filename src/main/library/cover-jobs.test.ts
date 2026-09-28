import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fallbackPalettes } from '../../shared/palette'
import { outcomeOf, PendingJobs } from './cover-jobs'

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
