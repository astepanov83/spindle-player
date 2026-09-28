import { describe, expect, it, vi } from 'vitest'
import { allowedImageHost, BusyError, CoverHttp, NetError, type FetchLike } from './cover-http'
import { RateLimit } from './rate'

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const caa = 'https://coverartarchive.org/release-group/x/front-1200'

// A response as fetch gives it, with the URL it ended at after redirects.
function answer(body: BodyInit | null, status = 200, url = caa): Response {
  const r = new Response(body, { status })
  Object.defineProperty(r, 'url', { value: url })
  return r
}

function http(fetch: FetchLike): { h: CoverHttp; waits: number[] } {
  const waits: number[] = []
  const limits = {
    musicbrainz: new RateLimit(1100, () => 0),
    deezer: new RateLimit(150, () => 0),
    itunes: new RateLimit(3000, () => 0),
    caa: new RateLimit(500, () => 0)
  }
  const h = new CoverHttp({
    fetch,
    sleep: async (ms) => void waits.push(ms),
    userAgent: 'Spindle/test',
    limits
  })
  return { h, waits }
}
const signal = new AbortController().signal
const api = 'https://api.deezer.com/search/album?q=x'

describe('CoverHttp.json', () => {
  it('sends the User-Agent and waits for the limiter', async () => {
    const fetch = vi.fn<FetchLike>(async () => answer(JSON.stringify({ ok: 1 })))
    const { h, waits } = http(fetch)
    expect(await h.json(api, 'deezer', signal)).toEqual({ ok: 1 })
    await h.json(api, 'deezer', signal)
    expect(waits).toEqual([0, 150])
    expect(fetch.mock.calls[0][1].headers).toMatchObject({ 'User-Agent': 'Spindle/test' })
  })

  it('gives undefined for a 404 and throws BusyError for a 429 or 503', async () => {
    expect(await http(async () => answer('', 404)).h.json(api, 'deezer', signal)).toBeUndefined()
    for (const status of [429, 503])
      await expect(
        http(async () => answer('', status)).h.json(api, 'deezer', signal)
      ).rejects.toBeInstanceOf(BusyError)
  })

  it('counts no connection, a 500 and a page that is not JSON as a network error', async () => {
    const cases: FetchLike[] = [
      async () => {
        throw new TypeError('fetch failed')
      },
      async () => answer('', 500),
      async () => answer('<html>Sign in to the Wi-Fi</html>')
    ]
    for (const f of cases)
      await expect(http(f).h.json(api, 'deezer', signal)).rejects.toBeInstanceOf(NetError)
  })

  it('lets a stop go through as it is, not as a network error', async () => {
    const stop = new AbortController()
    stop.abort()
    const f: FetchLike = async (_u, init) => {
      init.signal?.throwIfAborted()
      return answer('{}')
    }
    await expect(http(f).h.json(api, 'deezer', stop.signal)).rejects.not.toBeInstanceOf(NetError)
  })
})

describe('CoverHttp.image', () => {
  it('takes JPEG and PNG from the services own hosts', async () => {
    expect(await http(async () => answer(jpeg)).h.image(caa, 'caa', signal)).toEqual(jpeg)
    const redirected = async (): Promise<Response> =>
      answer(png, 200, 'https://ia800.us.archive.org/1/items/x/y.png')
    expect(await http(redirected).h.image(caa, 'caa', signal)).toEqual(png)
  })

  it('drops a picture from anywhere else, even after a redirect', async () => {
    const fetch = vi.fn<FetchLike>(async () => answer(jpeg, 200, 'https://evil.example/y.jpg'))
    expect(await http(fetch).h.image(caa, 'caa', signal)).toBeUndefined()
    expect(await http(fetch).h.image('https://evil.example/y.jpg', 'caa', signal)).toBeUndefined()
    // a URL from a bad host is never asked for
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('drops what is not JPEG or PNG', async () => {
    expect(await http(async () => answer('GIF89a...')).h.image(caa, 'caa', signal)).toBeUndefined()
  })

  it('stops reading a picture past 10 MB', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    big.set(jpeg)
    expect(await http(async () => answer(big)).h.image(caa, 'caa', signal)).toBeUndefined()
  })
})

describe('allowedImageHost', () => {
  it('knows the image hosts', () => {
    expect(allowedImageHost('https://cdn-images.dzcdn.net/images/cover/x/1000x1000.jpg')).toBe(true)
    expect(allowedImageHost('https://is1-ssl.mzstatic.com/image/x/1200x1200bb.jpg')).toBe(true)
    expect(allowedImageHost('https://archive.org/download/x/y.jpg')).toBe(true)
    expect(allowedImageHost('http://coverartarchive.org/x')).toBe(false)
    expect(allowedImageHost('https://dzcdn.net.evil.example/x')).toBe(false)
    expect(allowedImageHost('https://notarchive.org/x')).toBe(false)
    expect(allowedImageHost('not a url')).toBe(false)
  })
})
