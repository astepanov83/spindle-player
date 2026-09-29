import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { codecOf, findStreams } from './find-streams'

const read = (name: string): string => readFileSync(join(__dirname, 'fixtures', name), 'utf8')
const pls = read('metal-only.pls')
const status = read('status-json.xsl')

interface Reply {
  status?: number
  body?: string
  headers?: Record<string, string>
  // the address after redirects
  url?: string
}

// A fake fetch: the answer for each url, or a network error for one not listed.
function fakeFetch(replies: Record<string, Reply>): typeof fetch & { calls: string[] } {
  const calls: string[] = []
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    const r = replies[url]
    if (!r) throw new TypeError('fetch failed')
    const code = r.status ?? 200
    return {
      ok: code >= 200 && code < 300,
      status: code,
      url: r.url ?? url,
      headers: new Headers(r.headers),
      text: async () => r.body ?? ''
    } as Response
  }) as typeof fetch & { calls: string[] }
  fn.calls = calls
  return fn
}

const plsUrl = 'https://metal-only.streampanel.cloud/listen.pls'
const statusUrl = 'http://metalonly.spcast.eu/status-json.xsl'
// the first playlist entry redirects to the real server, with a time stamp
const entry = {
  'http://metal-only.sp.radio.fm/stream': {
    url: 'http://metalonly.spcast.eu/stream?time=1790708491',
    headers: { 'icy-br': '192', 'content-type': 'audio/mpeg' }
  }
}

describe('findStreams', () => {
  it('reads the playlist, probes the first entry and lists the server mounts', async () => {
    const f = fakeFetch({ [plsUrl]: { body: pls }, ...entry, [statusUrl]: { body: status } })
    const found = await findStreams({ pls: [plsUrl], streams: [] }, { fetch: f, log: vi.fn() })
    expect(found).toEqual([
      { url: 'http://metalonly.spcast.eu/stream', bitrate: 192, codec: 'mp3' },
      { url: 'http://metalonly.spcast.eu/stream320', bitrate: 312, codec: 'aac' },
      { url: 'http://metalonly.spcast.eu/stream64', bitrate: 72, codec: 'aac' }
    ])
    // the probe follows redirects with HEAD, and the stream body is never read
    expect(f.calls).toContain('HEAD http://metal-only.sp.radio.fm/stream')
  })

  it('skips the mount that repeats the bitrate and codec of the playlist stream', async () => {
    const f = fakeFetch({ [plsUrl]: { body: pls }, ...entry, [statusUrl]: { body: status } })
    const found = await findStreams({ pls: [plsUrl], streams: [] }, { fetch: f, log: vi.fn() })
    // /autodj is 192 mp3, the same as /stream
    expect(found.some((s) => s.url.endsWith('/autodj'))).toBe(false)
  })

  it('puts a mount on the host the stream came from', async () => {
    const f = fakeFetch({
      [plsUrl]: { body: pls },
      ...entry,
      [statusUrl]: { body: status.replaceAll('metalonly.spcast.eu', 'localhost:8000') }
    })
    const found = await findStreams({ pls: [plsUrl], streams: [] }, { fetch: f, log: vi.fn() })
    expect(found.map((s) => s.url)).toContain('http://metalonly.spcast.eu/stream64')
  })

  it('keeps the entry as it is when the probe fails', async () => {
    const f = fakeFetch({ [plsUrl]: { body: pls } })
    const log = vi.fn()
    const found = await findStreams({ pls: [plsUrl], streams: [] }, { fetch: f, log })
    expect(found).toEqual([{ url: 'http://metal-only.sp.radio.fm/stream' }])
    expect(log).toHaveBeenCalled()
  })

  it('looks at the mounts of a saved stream when there is no playlist', async () => {
    const f = fakeFetch({ [statusUrl]: { body: status } })
    const saved = [{ url: 'http://metalonly.spcast.eu/stream', bitrate: 192, codec: 'mp3' }]
    const found = await findStreams({ streams: saved }, { fetch: f, log: vi.fn() })
    expect(found.map((s) => s.url)).toEqual([
      'http://metalonly.spcast.eu/stream320',
      'http://metalonly.spcast.eu/stream64'
    ])
  })

  it('gives nothing and logs when every request fails', async () => {
    const log = vi.fn()
    const saved = [{ url: 'http://metalonly.spcast.eu/stream' }]
    const found = await findStreams(
      { pls: [plsUrl], streams: saved },
      { fetch: fakeFetch({}), log }
    )
    expect(found).toEqual([])
    expect(log).toHaveBeenCalled()
  })

  it('logs a playlist with nothing in it and a status page that is not JSON', async () => {
    const f = fakeFetch({ [plsUrl]: { body: '<html>' }, [statusUrl]: { body: 'nope' } })
    const log = vi.fn()
    const saved = [{ url: 'http://metalonly.spcast.eu/stream' }]
    const found = await findStreams({ pls: [plsUrl], streams: saved }, { fetch: f, log })
    expect(found).toEqual([])
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('logs a status page that answers 404', async () => {
    const f = fakeFetch({ [statusUrl]: { status: 404 } })
    const log = vi.fn()
    const saved = [{ url: 'http://metalonly.spcast.eu/stream' }]
    expect(await findStreams({ streams: saved }, { fetch: f, log })).toEqual([])
    expect(log).toHaveBeenCalledOnce()
  })
})

describe('codecOf', () => {
  it('names the codec from a content type', () => {
    expect(codecOf('audio/mpeg')).toBe('mp3')
    expect(codecOf('audio/aacp; charset=x')).toBe('aac')
    expect(codecOf('audio/aac')).toBe('aac')
    expect(codecOf('application/ogg')).toBe('ogg')
    expect(codecOf('audio/x-flac')).toBe('flac')
    expect(codecOf('text/html')).toBeUndefined()
    expect(codecOf('')).toBeUndefined()
  })
})
