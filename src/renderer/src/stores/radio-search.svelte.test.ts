// The Radio view's search: Radio Browser is asked 400ms after typing stops,
// and only the newest answer is shown.
import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RadioSearch } from '../../../shared/ipc'
import type { Station } from '../../../shared/stations'

const answers = new Map<string, (r: RadioSearch) => void>()
const search = vi.fn(
  (q: string) =>
    new Promise<RadioSearch>((ok) => {
      answers.set(q, ok)
    })
)
vi.stubGlobal('window', { radioApi: { search } })

const { radioSearch } = await import('./radio-search.svelte')

const found = (id: string): Station => ({
  id,
  name: id,
  tags: [],
  streams: [{ url: 'https://x/' }]
})

beforeEach(() => {
  vi.useFakeTimers()
  radioSearch.want('')
  search.mockClear()
  answers.clear()
})
afterEach(() => vi.useRealTimers())

describe('radioSearch', () => {
  it('asks once, 400ms after the last key', async () => {
    radioSearch.want('d')
    await vi.advanceTimersByTimeAsync(200)
    radioSearch.want('dro')
    await vi.advanceTimersByTimeAsync(200)
    radioSearch.want('drone')
    expect(radioSearch.status).toBe('searching')
    await vi.advanceTimersByTimeAsync(399)
    expect(search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(search).toHaveBeenCalledExactlyOnceWith('drone')
    answers.get('drone')!({ ok: true, stations: [found('rb-1')] })
    await vi.advanceTimersByTimeAsync(0)
    expect(radioSearch.status).toBe('done')
    expect(radioSearch.results.map((s) => s.id)).toEqual(['rb-1'])
  })

  it('drops an older answer that comes last', async () => {
    radioSearch.want('dro')
    await vi.advanceTimersByTimeAsync(400)
    radioSearch.want('drone')
    await vi.advanceTimersByTimeAsync(400)
    answers.get('drone')!({ ok: true, stations: [found('rb-new')] })
    answers.get('dro')!({ ok: true, stations: [found('rb-old')] })
    await vi.advanceTimersByTimeAsync(0)
    expect(radioSearch.results.map((s) => s.id)).toEqual(['rb-new'])
  })

  it('says when Radio Browser cannot be reached', async () => {
    radioSearch.want('drone')
    await vi.advanceTimersByTimeAsync(400)
    answers.get('drone')!({ ok: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(radioSearch.status).toBe('unreachable')
    expect(radioSearch.results).toEqual([])
  })

  it('takes a failed call as unreachable', async () => {
    search.mockRejectedValueOnce(new Error('no handler'))
    radioSearch.want('drone')
    await vi.advanceTimersByTimeAsync(400)
    expect(radioSearch.status).toBe('unreachable')
  })

  it('does not ask again for the search it shows, but does after a failure', async () => {
    radioSearch.want('drone')
    await vi.advanceTimersByTimeAsync(400)
    answers.get('drone')!({ ok: true, stations: [] })
    await vi.advanceTimersByTimeAsync(0)
    radioSearch.want(' drone ')
    await vi.advanceTimersByTimeAsync(400)
    expect(search).toHaveBeenCalledOnce()

    radioSearch.want('ambient')
    await vi.advanceTimersByTimeAsync(400)
    answers.get('ambient')!({ ok: false })
    await vi.advanceTimersByTimeAsync(0)
    radioSearch.want('ambient')
    await vi.advanceTimersByTimeAsync(400)
    expect(search).toHaveBeenCalledTimes(3)
  })

  it('a cleared box shows no results and drops the answer on its way', async () => {
    radioSearch.want('drone')
    await vi.advanceTimersByTimeAsync(400)
    radioSearch.want('')
    answers.get('drone')!({ ok: true, stations: [found('rb-1')] })
    await vi.advanceTimersByTimeAsync(0)
    expect(radioSearch.status).toBe('idle')
    expect(radioSearch.results).toEqual([])
  })
})

describe('radioSearch in an effect', () => {
  it('asks once when Radio Browser cannot be reached, not again and again', async () => {
    // the view opens with an empty box, then the user types
    const box = $state({ q: '' })
    const stop = $effect.root(() => {
      // what RadioView does
      $effect(() => radioSearch.want(box.q))
    })
    flushSync()
    box.q = 'drone'
    flushSync()
    await vi.advanceTimersByTimeAsync(400)
    answers.get('drone')!({ ok: false })
    await vi.advanceTimersByTimeAsync(0)
    flushSync()
    await vi.advanceTimersByTimeAsync(2000)
    expect(search).toHaveBeenCalledOnce()
    expect(radioSearch.status).toBe('unreachable')
    stop()
  })
})
