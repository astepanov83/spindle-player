import { describe, expect, it } from 'vitest'
import { CoverBlob, type BlobIo } from './cover-blob'

// Pictures the test hands out by key, and blob URLs by number.
function io(): BlobIo & {
  make(key: string): () => Promise<Blob | undefined>
  answer(key: string, type?: string): void
  fail(key: string): void
  revoked: string[]
  made: string[]
} {
  const waiting = new Map<string, (b: Blob | undefined) => void>()
  let n = 0
  const out = {
    revoked: [] as string[],
    made: [] as string[],
    make: (key: string) => () => {
      out.made.push(key)
      return new Promise<Blob | undefined>((r) => waiting.set(key, r))
    },
    create: () => `blob:${++n}`,
    revoke: (url: string) => void out.revoked.push(url),
    answer(key: string, type = 'image/jpeg') {
      waiting.get(key)!(new Blob(['x'], { type }))
    },
    fail(key: string) {
      waiting.get(key)!(undefined)
    }
  }
  return out
}

describe('CoverBlob', () => {
  it('gives a blob URL with the picture’s own type', async () => {
    const f = io()
    const c = new CoverBlob(f)
    const p = c.load('a', f.make('a'))
    f.answer('a', 'image/png')
    expect(await p).toEqual({ src: 'blob:1', type: 'image/png' })
  })

  it('makes the same picture once, and frees the old blob for a new one', async () => {
    const f = io()
    const c = new CoverBlob(f)
    const a = c.load('a', f.make('a'))
    f.answer('a')
    await a
    expect(await c.load('a', f.make('a'))).toEqual({ src: 'blob:1', type: 'image/jpeg' })
    expect(f.made).toEqual(['a'])
    const b = c.load('b', f.make('b'))
    f.answer('b')
    expect((await b)?.src).toBe('blob:2')
    expect(f.revoked).toEqual(['blob:1'])
  })

  it('drops a picture that came after a newer one was asked for', async () => {
    const f = io()
    const c = new CoverBlob(f)
    const a = c.load('a', f.make('a'))
    const b = c.load('b', f.make('b'))
    f.answer('b')
    f.answer('a')
    expect(await a).toBeUndefined()
    expect((await b)?.src).toBe('blob:1')
    expect(f.revoked).toEqual([])
  })

  it('gives nothing when there is no picture, and tries again next time', async () => {
    const f = io()
    const c = new CoverBlob(f)
    const a = c.load('a', f.make('a'))
    f.fail('a')
    expect(await a).toBeUndefined()
    const again = c.load('a', f.make('a'))
    f.answer('a')
    expect(await again).toEqual({ src: 'blob:1', type: 'image/jpeg' })
    expect(f.made).toEqual(['a', 'a'])
  })

  it('gives nothing when making the picture throws', async () => {
    const c = new CoverBlob(io())
    expect(await c.load('x', () => Promise.reject(new Error('no')))).toBeUndefined()
  })
})
