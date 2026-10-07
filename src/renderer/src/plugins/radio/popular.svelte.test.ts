// Radio Browser's popular stations (ticket 082): asked when the Radio tab
// opens, kept for the session, asked again a while after a failure.
import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RadioSearch } from '../../../../shared/plugins/radio/ipc'
import type { Station } from '../../../../shared/plugins/radio/stations'

let answer: (r: RadioSearch) => void = () => {}
const popular = vi.fn(
  () =>
    new Promise<RadioSearch>((ok) => {
      answer = ok
    })
)
vi.stubGlobal('window', { radioApi: { popular } })
// the real one starts the audio engine
const searched = vi.fn()
vi.mock('./store.svelte', () => ({ radio: { searched } }))

const found = (id: string): Station => ({
  id,
  name: id,
  tags: [],
  streams: [{ url: 'https://x/' }]
})

let radioPopular: (typeof import('./popular.svelte'))['radioPopular']

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  popular.mockClear()
  searched.mockClear()
  radioPopular = (await import('./popular.svelte')).radioPopular
})
afterEach(() => vi.useRealTimers())

describe('radioPopular', () => {
  it('asks once, and keeps the answer for the session', async () => {
    expect(radioPopular.status).toBe('idle')
    radioPopular.want()
    expect(radioPopular.status).toBe('loading')
    radioPopular.want()
    expect(popular).toHaveBeenCalledOnce()
    answer({ ok: true, stations: [found('rb-1')] })
    await vi.advanceTimersByTimeAsync(0)
    expect(radioPopular.status).toBe('done')
    expect(radioPopular.find('rb-1')?.id).toBe('rb-1')
    await vi.advanceTimersByTimeAsync(3_600_000)
    radioPopular.want()
    expect(popular).toHaveBeenCalledOnce()
  })

  it('says when Radio Browser cannot be reached, and asks again 30 s later', async () => {
    radioPopular.want()
    answer({ ok: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(radioPopular.status).toBe('unreachable')
    await vi.advanceTimersByTimeAsync(29_000)
    radioPopular.want()
    expect(popular).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1_000)
    radioPopular.want()
    expect(popular).toHaveBeenCalledTimes(2)
  })

  it('takes a failed call as unreachable', async () => {
    popular.mockRejectedValueOnce(new Error('no handler'))
    radioPopular.want()
    await vi.advanceTimersByTimeAsync(0)
    expect(radioPopular.status).toBe('unreachable')
  })

  it('passes My stations on when the answer added streams to them', async () => {
    radioPopular.want()
    const mine = [found('rb-1')]
    answer({ ok: true, stations: [found('rb-1')], saved: mine })
    await vi.advanceTimersByTimeAsync(0)
    expect(searched).toHaveBeenCalledWith(mine)
  })

  it('asks once from an effect, also when it fails, not again and again', async () => {
    const box = $state({ q: '' })
    const stop = $effect.root(() => {
      // what BlockPage does, through radio's typed()
      $effect(() => {
        void box.q
        radioPopular.want()
      })
    })
    flushSync()
    answer({ ok: false })
    await vi.advanceTimersByTimeAsync(0)
    flushSync()
    box.q = 'x'
    flushSync()
    expect(popular).toHaveBeenCalledOnce()
    stop()
  })
})
