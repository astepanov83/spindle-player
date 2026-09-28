import { describe, expect, it, vi } from 'vitest'
import { orFallback } from './start'

describe('orFallback', () => {
  it('gives the answer', async () => {
    expect(await orFallback(async () => 5, 0, 'x')).toEqual({ value: 5, ok: true })
  })

  it('gives the fallback when the ask fails or throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await orFallback(() => Promise.reject(new Error('no')), 0, 'x')).toEqual({
      value: 0,
      ok: false
    })
    expect(
      await orFallback(
        () => {
          throw new Error('no')
        },
        [] as number[],
        'x'
      )
    ).toEqual({ value: [], ok: false })
  })
})
