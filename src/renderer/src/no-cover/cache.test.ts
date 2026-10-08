import { describe, expect, it } from 'vitest'
import { PictureCache } from './cache'

function setup(max = 3): { cache: PictureCache; made: string[]; revoked: string[] } {
  const made: string[] = []
  const revoked: string[] = []
  let n = 0
  const cache = new PictureCache(
    {
      create: () => {
        const url = `blob:${++n}`
        made.push(url)
        return url
      },
      revoke: (url) => revoked.push(url)
    },
    max
  )
  return { cache, made, revoked }
}

const blob = (): Promise<Blob> => Promise.resolve(new Blob(['x']))

describe('PictureCache', () => {
  it('gives the same URL for the same key, drawn once', async () => {
    const { cache, made } = setup()
    let draws = 0
    const make = (): Promise<Blob> => {
      draws++
      return blob()
    }
    const [a, b] = await Promise.all([cache.load('k', make), cache.load('k', make)])
    expect(a).toBe('blob:1')
    expect(b).toBe(a)
    expect(await cache.load('k', make)).toBe(a)
    expect(cache.get('k')).toBe(a)
    expect(draws).toBe(1)
    expect(made).toEqual(['blob:1'])
  })

  it('gives other keys other URLs', async () => {
    const { cache } = setup()
    expect(await cache.load('a', blob)).not.toBe(await cache.load('b', blob))
    expect(cache.get('c')).toBeUndefined()
  })

  it('drops the one used longest ago over the count, and frees its URL', async () => {
    const { cache, revoked } = setup(2)
    const a = await cache.load('a', blob)
    await cache.load('b', blob)
    // a is used again, so b is now the oldest
    cache.get('a')
    await cache.load('c', blob)
    expect(cache.size).toBe(2)
    expect(revoked).toEqual(['blob:2'])
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(a)
  })

  it('tries a failed drawing again next time', async () => {
    const { cache } = setup()
    expect(await cache.load('k', () => Promise.reject(new Error('no canvas')))).toBeUndefined()
    expect(cache.size).toBe(0)
    expect(await cache.load('k', blob)).toBe('blob:1')
  })
})
