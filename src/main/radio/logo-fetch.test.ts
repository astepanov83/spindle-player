import { describe, expect, it, vi } from 'vitest'
import { fetchLogo, isLogoPicture, localAddress, pictureSize, privateHost } from './logo-fetch'

const be32 = (n: number): number[] => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le16 = (n: number): number[] => [n & 255, n >>> 8]
const le24 = (n: number): number[] => [n & 255, (n >>> 8) & 255, n >>> 16]
const ascii = (t: string): number[] => [...t].map((c) => c.charCodeAt(0))

// the first bytes of each kind of picture, as far as the size
function pngOf(w: number, h: number): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return new Uint8Array([
    ...sig,
    ...be32(13),
    ...ascii('IHDR'),
    ...be32(w),
    ...be32(h),
    8,
    2,
    0,
    0,
    0
  ])
}
const gifOf = (w: number, h: number): Uint8Array =>
  new Uint8Array([...ascii('GIF89a'), ...le16(w), ...le16(h), 0, 0, 0])
function jpegOf(w: number, h: number): Uint8Array {
  // SOI, an APP0 of 16 bytes, then SOF0
  const app0 = [0xff, 0xe0, 0, 16, ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]
  const sof = [0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0, 0, 0, 0, 0, 0, 0, 0, 0])
}
const riff = (chunk: string, body: number[]): Uint8Array =>
  new Uint8Array([
    ...ascii('RIFF'),
    0,
    0,
    0,
    0,
    ...ascii('WEBP'),
    ...ascii(chunk),
    0,
    0,
    0,
    0,
    ...body
  ])
const webpLossy = (w: number, h: number): Uint8Array =>
  riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h)])
function webpLossless(w: number, h: number): Uint8Array {
  const bits = (w - 1) | ((h - 1) << 14)
  return riff('VP8L', [
    0x2f,
    bits & 255,
    (bits >>> 8) & 255,
    (bits >>> 16) & 255,
    (bits >>> 24) & 255
  ])
}
const webpExtended = (w: number, h: number): Uint8Array =>
  riff('VP8X', [0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)])
function icoOf(w: number, h: number, inner?: Uint8Array): Uint8Array {
  const entry = [
    w & 255,
    h & 255,
    0,
    0,
    1,
    0,
    32,
    0,
    ...le16(inner?.length ?? 0),
    0,
    0,
    22,
    0,
    0,
    0
  ]
  return new Uint8Array([0, 0, 1, 0, 1, 0, ...entry, ...(inner ?? [])])
}

const png = pngOf(120, 80)
const url = 'https://radio.example/logo.png'

function answer(body: BodyInit | Uint8Array | null, status = 200, at = url): Response {
  const r = new Response(body as BodyInit | null, { status })
  Object.defineProperty(r, 'url', { value: at })
  return r
}

describe('fetchLogo', () => {
  it('gives the picture, sending the User-Agent with a timeout', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => answer(png))
    expect(await fetchLogo(url, { fetch, userAgent: 'Spindle/test' })).toEqual(png)
    const init = fetch.mock.calls[0][1]!
    expect(init.headers).toEqual({ 'User-Agent': 'Spindle/test' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('fails for a 404, a page that is not a picture, or a picture that is too big', async () => {
    const d = (r: Response): Parameters<typeof fetchLogo>[1] => ({
      fetch: async () => r,
      userAgent: 'x',
      maxBytes: 20
    })
    await expect(fetchLogo(url, d(answer('gone', 404)))).rejects.toThrow('404')
    await expect(fetchLogo(url, d(answer('<html>')))).rejects.toThrow('not a picture')
    await expect(fetchLogo(url, d(answer(new Uint8Array(30).fill(0x89))))).rejects.toThrow(
      'too big'
    )
  })

  it('asks only http and https addresses', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => answer(png))
    await expect(fetchLogo('file:///etc/passwd', { fetch, userAgent: 'x' })).rejects.toThrow()
    await expect(fetchLogo('not a url', { fetch, userAgent: 'x' })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails when the connection fails', async () => {
    const fetch = async (): Promise<Response> => {
      throw new TypeError('fetch failed')
    }
    await expect(fetchLogo(url, { fetch, userAgent: 'x' })).rejects.toThrow('fetch failed')
  })
})

describe('pictureSize', () => {
  it('reads the size from the header of each kind', () => {
    expect(pictureSize(pngOf(300, 200))).toEqual({ width: 300, height: 200 })
    expect(pictureSize(gifOf(64, 32))).toEqual({ width: 64, height: 32 })
    expect(pictureSize(jpegOf(1200, 900))).toEqual({ width: 1200, height: 900 })
    expect(pictureSize(webpLossy(400, 300))).toEqual({ width: 400, height: 300 })
    expect(pictureSize(webpLossless(5000, 17))).toEqual({ width: 5000, height: 17 })
    expect(pictureSize(webpExtended(9000, 9000))).toEqual({ width: 9000, height: 9000 })
    // an icon's 0 is 256; a PNG inside counts with its own size
    expect(pictureSize(icoOf(0, 0))).toEqual({ width: 256, height: 256 })
    expect(pictureSize(icoOf(0, 0, pngOf(30000, 30000)))).toEqual({ width: 30000, height: 30000 })
  })

  it('knows no size for a cut-off header', () => {
    expect(pictureSize(pngOf(300, 200).slice(0, 20))).toBeUndefined()
    expect(pictureSize(jpegOf(300, 200).slice(0, 12))).toBeUndefined()
    expect(pictureSize(new Uint8Array([1, 2, 3]))).toBeUndefined()
  })
})

describe('fetchLogo and the picture size', () => {
  const d = (body: Uint8Array): Parameters<typeof fetchLogo>[1] => ({
    fetch: async () => answer(body),
    userAgent: 'x'
  })

  it('takes a picture up to 4096 px a side', async () => {
    expect(await fetchLogo(url, d(pngOf(4096, 4096)))).toBeDefined()
    expect(await fetchLogo(url, d(jpegOf(4000, 100)))).toBeDefined()
  })

  it('refuses one bigger than that, or of no known size, before it is decoded', async () => {
    await expect(fetchLogo(url, d(pngOf(30000, 30000)))).rejects.toThrow('too many pixels')
    await expect(fetchLogo(url, d(webpExtended(5000, 10)))).rejects.toThrow('too many pixels')
    await expect(fetchLogo(url, d(icoOf(0, 0, pngOf(8000, 8000))))).rejects.toThrow(
      'too many pixels'
    )
    await expect(fetchLogo(url, d(jpegOf(300, 200).slice(0, 12)))).rejects.toThrow('no size')
  })
})

describe('isLogoPicture', () => {
  it('knows the kinds of picture logos come in', () => {
    const kinds = [
      [0xff, 0xd8, 0xff, 0xe0],
      [0x89, 0x50, 0x4e, 0x47],
      [0x47, 0x49, 0x46, 0x38],
      [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
      [0, 0, 1, 0]
    ]
    for (const k of kinds) expect(isLogoPicture(new Uint8Array(k))).toBe(true)
    expect(isLogoPicture(new TextEncoder().encode('<svg xmlns='))).toBe(false)
    expect(isLogoPicture(new Uint8Array())).toBe(false)
  })
})

describe('privateHost', () => {
  it('knows loopback, private and link-local addresses, as the URL parser writes them', () => {
    const host = (u: string): string => new URL(u).hostname
    for (const u of [
      'http://127.0.0.1/',
      'http://0x7f.1/',
      'http://2130706433/',
      'http://10.1.2.3/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://192.168.1.1/',
      'http://169.254.169.254/',
      'http://100.64.0.1/',
      'http://0.0.0.0/',
      'http://[::1]/',
      'http://[::]/',
      'http://[fe80::1]/',
      'http://[fd12:3456::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:192.168.0.1]/',
      'http://localhost/',
      'http://LOCALHOST./',
      'http://radio.localhost/'
    ])
      expect(privateHost(host(u)), u).toBe(true)
    for (const u of [
      'http://8.8.8.8/',
      'http://172.32.0.1/',
      'http://[2001:4860::8888]/',
      'http://example.com/',
      'http://localhost.example.com/'
    ])
      expect(privateHost(host(u)), u).toBe(false)
  })
})

describe('localAddress', () => {
  it('is true for a web address on the local network', () => {
    expect(localAddress('http://192.168.1.5:8000/stream')).toBe(true)
    expect(localAddress('https://example.com/')).toBe(false)
    expect(localAddress('not a url')).toBe(false)
    expect(localAddress(undefined)).toBe(false)
  })
})

describe('fetchLogo on the local network', () => {
  it('refuses a local address unless the caller allows it', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => answer(png))
    for (const u of ['http://127.0.0.1/l.png', 'http://[::1]/l.png', 'http://localhost/l.png'])
      await expect(fetchLogo(u, { fetch, userAgent: 'x' })).rejects.toThrow(/local network/)
    expect(fetch).not.toHaveBeenCalled()
    expect(
      await fetchLogo('http://10.0.0.5/l.png', { fetch, userAgent: 'x', privateOk: true })
    ).toEqual(png)
  })

  it('refuses a picture that ended up on the local network after a redirect', async () => {
    const fetch = async (): Promise<Response> => answer(png, 200, 'http://192.168.0.1/l.png')
    await expect(fetchLogo(url, { fetch, userAgent: 'x' })).rejects.toThrow(/local network/)
  })
})
