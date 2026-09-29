import { describe, expect, it, vi } from 'vitest'
import { fetchLogo, isLogoPicture } from './logo-fetch'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])
const url = 'https://radio.example/logo.png'

function answer(body: BodyInit | null, status = 200, at = url): Response {
  const r = new Response(body, { status })
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
