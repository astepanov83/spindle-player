import { describe, expect, it, vi } from 'vitest'
import type { Station } from '../../../shared/stations'
import { logoType, ResultLogos } from './result-logos'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

const station = (id: string, logoUrl?: string): Station => ({
  id,
  name: id,
  tags: [],
  streams: [{ url: 'http://x.example/' }],
  ...(logoUrl ? { logoUrl } : {})
})

// A load that waits until the test lets it go.
type Load = (url: string) => Promise<Uint8Array>

function held(): {
  load: ReturnType<typeof vi.fn<Load>>
  release(url: string, data?: Uint8Array): void
  fail(url: string): void
} {
  const waiting = new Map<string, { ok(d: Uint8Array): void; no(e: Error): void }>()
  const load = vi.fn<Load>(
    (url) =>
      new Promise<Uint8Array>((ok, no) => {
        waiting.set(url, { ok, no })
      })
  )
  return {
    load,
    release: (url, data = png) => waiting.get(url)!.ok(data),
    fail: (url) => waiting.get(url)!.no(new Error('HTTP 404'))
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('ResultLogos', () => {
  it('fetches only the logo of a station from a search', async () => {
    const h = held()
    const logos = new ResultLogos({ load: h.load, log: () => {} })
    expect(await logos.get('rb-none')).toBeUndefined()
    logos.searched([station('rb-a', 'https://a.example/a.png'), station('rb-b')])
    expect(await logos.get('rb-b')).toBeUndefined()
    const got = logos.get('rb-a')
    await tick()
    h.release('https://a.example/a.png')
    expect(await got).toEqual({ data: png, type: 'image/png' })
    expect(h.load).toHaveBeenCalledTimes(1)
  })

  it('keeps a logo for a while, then fetches it again', async () => {
    let now = 1000
    const load = vi.fn(async () => jpeg)
    const logos = new ResultLogos({ load, log: () => {}, now: () => now })
    logos.searched([station('rb-a', 'https://a.example/a.jpg')])
    await logos.get('rb-a')
    await logos.get('rb-a')
    expect(load).toHaveBeenCalledTimes(1)
    now += 11 * 60_000
    expect(await logos.get('rb-a')).toEqual({ data: jpeg, type: 'image/jpeg' })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keeps a failure for a while too, so rows scrolled back do not ask again', async () => {
    const load = vi.fn(async () => {
      throw new Error('HTTP 404')
    })
    const log = vi.fn()
    const logos = new ResultLogos({ load, log })
    logos.searched([station('rb-a', 'https://a.example/a.png')])
    expect(await logos.get('rb-a')).toBeUndefined()
    expect(await logos.get('rb-a')).toBeUndefined()
    expect(load).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('https://a.example/a.png'))
  })

  it('fetches a few at a time', async () => {
    const h = held()
    const logos = new ResultLogos({ load: h.load, log: () => {} })
    const list = [1, 2, 3, 4, 5, 6].map((n) => station(`rb-${n}`, `https://l.example/${n}.png`))
    logos.searched(list)
    const all = list.map((s) => logos.get(s.id))
    await tick()
    expect(h.load).toHaveBeenCalledTimes(4)
    h.release('https://l.example/1.png')
    await tick()
    expect(h.load).toHaveBeenCalledTimes(5)
    for (const n of [2, 3, 4]) h.release(`https://l.example/${n}.png`)
    await tick()
    for (const n of [5, 6]) h.release(`https://l.example/${n}.png`)
    expect((await Promise.all(all)).every((r) => r?.type === 'image/png')).toBe(true)
  })

  it('drops a waiting row whose station is not in the newest search', async () => {
    const h = held()
    const logos = new ResultLogos({ load: h.load, log: () => {} })
    const list = [1, 2, 3, 4, 5].map((n) => station(`rb-${n}`, `https://l.example/${n}.png`))
    logos.searched(list)
    const all = list.map((s) => logos.get(s.id))
    await tick()
    // a new search, without station 5
    logos.searched(list.slice(0, 4))
    h.release('https://l.example/1.png')
    expect(await all[4]).toBeUndefined()
    expect(h.load).toHaveBeenCalledTimes(4)
  })

  it('asks once for two rows with the same logo', async () => {
    const h = held()
    const logos = new ResultLogos({ load: h.load, log: () => {} })
    logos.searched([
      station('rb-a', 'https://l.example/x.png'),
      station('rb-b', 'https://l.example/x.png')
    ])
    const a = logos.get('rb-a')
    const b = logos.get('rb-b')
    await tick()
    h.release('https://l.example/x.png')
    expect((await a)?.data).toBe(png)
    expect((await b)?.data).toBe(png)
    expect(h.load).toHaveBeenCalledTimes(1)
  })

  it('keeps no more than its byte limit, dropping the oldest', async () => {
    const big = (n: number): Uint8Array => {
      const b = new Uint8Array(600)
      b.set(png)
      b[10] = n
      return b
    }
    const load = vi.fn(async (url: string) => big(Number(url.slice(-5, -4))))
    const logos = new ResultLogos({ load, log: () => {}, maxBytes: 1000 })
    logos.searched([
      station('rb-1', 'https://l.example/1.png'),
      station('rb-2', 'https://l.example/2.png')
    ])
    await logos.get('rb-1')
    await logos.get('rb-2')
    await logos.get('rb-2')
    expect(load).toHaveBeenCalledTimes(2)
    await logos.get('rb-1')
    expect(load).toHaveBeenCalledTimes(3)
  })
})

describe('ResultLogos and the newest search', () => {
  it('serves only stations of the newest search', async () => {
    const load = vi.fn(async () => png)
    const logos = new ResultLogos({ load, log: () => {} })
    logos.searched([station('rb-a', 'https://a.example/a.png')])
    logos.searched([station('rb-b', 'https://b.example/b.png')])
    expect(await logos.get('rb-a')).toBeUndefined()
    expect(await logos.get('rb-b')).toEqual({ data: png, type: 'image/png' })
    expect(load).toHaveBeenCalledOnce()
  })

  it('drops expired logos when it keeps a new one, asked for or not', async () => {
    let now = 0
    const big = new Uint8Array(600)
    big.set(png)
    const load = vi.fn(async () => big)
    const logos = new ResultLogos({ load, log: () => {}, now: () => now, maxBytes: 1000 })
    logos.searched([
      station('rb-a', 'https://a.example/a.png'),
      station('rb-b', 'https://b.example/b.png')
    ])
    await logos.get('rb-a')
    now += 11 * 60_000
    await logos.get('rb-b')
    expect(logos.bytes).toBe(600)
  })
})

describe('logoType', () => {
  it('names the picture type from its first bytes', () => {
    expect(logoType(png)).toBe('image/png')
    expect(logoType(jpeg)).toBe('image/jpeg')
    expect(logoType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe('image/gif')
    expect(logoType(new Uint8Array([0, 0, 1, 0]))).toBe('image/x-icon')
    expect(
      logoType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))
    ).toBe('image/webp')
  })
})
