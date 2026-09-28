import { describe, expect, it } from 'vitest'
import { CoverBlob, type BlobIo } from './cover-blob'

// A fake fetch whose answers the test hands out, and blob URLs by number.
function io(): BlobIo & {
  answer(url: string, type?: string): void
  fail(url: string): void
  revoked: string[]
  fetched: string[]
} {
  const waiting = new Map<string, (r: { ok: boolean; blob(): Promise<Blob> }) => void>()
  let n = 0
  const out = {
    revoked: [] as string[],
    fetched: [] as string[],
    fetch(url: string) {
      out.fetched.push(url)
      return new Promise<{ ok: boolean; blob(): Promise<Blob> }>((r) => waiting.set(url, r))
    },
    create: () => `blob:${++n}`,
    revoke: (url: string) => void out.revoked.push(url),
    answer(url: string, type = 'image/jpeg') {
      waiting.get(url)!({ ok: true, blob: async () => new Blob(['x'], { type }) })
    },
    fail(url: string) {
      waiting.get(url)!({ ok: false, blob: async () => new Blob() })
    }
  }
  return out
}

describe('CoverBlob', () => {
  it('gives a blob URL with the type main sent', async () => {
    const f = io()
    const c = new CoverBlob(f)
    const p = c.load('spindle://cover/large/a')
    f.answer('spindle://cover/large/a', 'image/png')
    expect(await p).toEqual({ src: 'blob:1', type: 'image/png' })
  })

  it('fetches the same cover once, and frees the old blob for a new one', async () => {
    const f = io()
    const c = new CoverBlob(f)
    const a = c.load('a')
    f.answer('a')
    await a
    expect(await c.load('a')).toEqual({ src: 'blob:1', type: 'image/jpeg' })
    expect(f.fetched).toEqual(['a'])
    const b = c.load('b')
    f.answer('b')
    expect((await b)?.src).toBe('blob:2')
    expect(f.revoked).toEqual(['blob:1'])
  })

  it('drops a cover that came after a newer one was asked for', async () => {
    const f = io()
    const c = new CoverBlob(f)
    const a = c.load('a')
    const b = c.load('b')
    f.answer('b')
    f.answer('a')
    expect(await a).toBeUndefined()
    expect((await b)?.src).toBe('blob:1')
    expect(f.revoked).toEqual([])
  })

  it('gives nothing when main has no cover, and asks again next time', async () => {
    const f = io()
    const c = new CoverBlob(f)
    const a = c.load('a')
    f.fail('a')
    expect(await a).toBeUndefined()
    const again = c.load('a')
    f.answer('a')
    expect(await again).toEqual({ src: 'blob:1', type: 'image/jpeg' })
    expect(f.fetched).toEqual(['a', 'a'])
  })
})
