import { readFileSync } from 'fs'
import { join } from 'path'
import { EventEmitter } from 'events'
import type { ClientRequest, ClientRequestConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { mergeStreams } from '../../shared/stations'
import { checkedFetch } from './checked-fetch'
import { codecOf, findStreams } from './find-streams'

const read = (name: string): string => readFileSync(join(__dirname, 'fixtures', name), 'utf8')
const pls = read('metal-only.pls')
const status = read('status-json.xsl')

interface Reply {
  status?: number
  body?: string
  headers?: Record<string, string>
  // a 302 to here
  redirect?: string
  // the body never ends (a stream, or a Shoutcast v1 server's answer to HEAD)
  endless?: boolean
}

// What the app does: checkedFetch over a stand-in for net.request, which
// answers each url from the list, or fails for one not listed.
function fakeFetch(
  replies: Record<string, Reply>,
  privateOk = false
): typeof fetch & { calls: string[]; agents: string[]; aborted: string[] } {
  const calls: string[] = []
  const agents: string[] = []
  const aborted: string[] = []
  const request = (o: ClientRequestConstructorOptions): ClientRequest => {
    const req = new EventEmitter() as EventEmitter & Record<string, unknown>
    let url = o.url!
    req.setHeader = (k: string, v: string) => {
      if (k.toLowerCase() === 'user-agent') agents.push(v)
    }
    req.abort = () => aborted.push(url)
    const next = (): void => {
      calls.push(`${o.method} ${url}`)
      const r = replies[url]
      if (!r) return void req.emit('error', new Error('net::ERR_NAME_NOT_RESOLVED'))
      if (r.redirect) {
        url = r.redirect
        return void req.emit('redirect', 302, o.method, r.redirect, {})
      }
      const res = Object.assign(new EventEmitter(), {
        statusCode: r.status ?? 200,
        headers: r.headers ?? {}
      })
      req.emit('response', res)
      queueMicrotask(() => {
        if (r.body && o.method !== 'HEAD') res.emit('data', Buffer.from(r.body))
        if (r.endless) res.emit('data', Buffer.alloc(100))
        else res.emit('end')
      })
    }
    req.end = () => queueMicrotask(next)
    req.followRedirect = () => queueMicrotask(next)
    return req as unknown as ClientRequest
  }
  return Object.assign(checkedFetch(request, privateOk), { calls, agents, aborted })
}

const plsUrl = 'https://metal-only.streampanel.cloud/listen.pls'
const statusUrl = 'http://metalonly.spcast.eu/status-json.xsl'
// the first playlist entry redirects to the real server, with a time stamp
const entry = {
  'http://metal-only.sp.radio.fm/stream': {
    redirect: 'http://metalonly.spcast.eu/stream?time=1790708491'
  },
  'http://metalonly.spcast.eu/stream?time=1790708491': {
    headers: { 'icy-br': '192', 'content-type': 'audio/mpeg' },
    endless: true
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
    expect(f.calls).toContain('HEAD http://metalonly.spcast.eu/stream?time=1790708491')
    await vi.waitFor(() =>
      expect(f.aborted).toContain('http://metalonly.spcast.eu/stream?time=1790708491')
    )
  })

  it('asks as Spindle/<version>', async () => {
    const f = fakeFetch({ [plsUrl]: { body: pls }, ...entry, [statusUrl]: { body: status } })
    await findStreams(
      { pls: [plsUrl], streams: [] },
      { fetch: f, log: vi.fn(), userAgent: 'Spindle/1.2.3' }
    )
    expect(f.agents).toHaveLength(3)
    expect(new Set(f.agents)).toEqual(new Set(['Spindle/1.2.3']))
  })

  it('refuses a playlist or status page too big to be one', async () => {
    const big = 'x'.repeat(1024 * 1024 + 1)
    const f = fakeFetch({ [plsUrl]: { body: big }, [statusUrl]: { body: big } })
    const log = vi.fn()
    const saved = [{ url: 'http://metalonly.spcast.eu/stream', bitrate: 192, codec: 'mp3' }]
    expect(await findStreams({ pls: [plsUrl], streams: saved }, { fetch: f, log })).toEqual([])
    expect(log.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringMatching(/listen\.pls.*too big/),
      expect.stringMatching(/status-json\.xsl.*too big/)
    ])
  })

  describe('a playlist entry on the local network', () => {
    const local: Record<string, Reply> = {
      [plsUrl]: { body: '[playlist]\nFile1=http://192.168.1.5:8000/stream\n' },
      'http://192.168.1.5:8000/stream': { headers: { 'content-type': 'audio/mpeg' } },
      'http://192.168.1.5:8000/status-json.xsl': { status: 404 }
    }

    it('is refused for a station on the web, and never asked', async () => {
      const f = fakeFetch(local)
      const log = vi.fn()
      expect(await findStreams({ pls: [plsUrl], streams: [] }, { fetch: f, log })).toEqual([])
      expect(f.calls.join()).not.toMatch(/192\.168/)
      expect(String(log.mock.calls[0][0])).toMatch(/local network/)
    })

    it('is asked for a station on the local network itself', async () => {
      const f = fakeFetch(local, true)
      const found = await findStreams(
        { pls: [plsUrl], streams: [] },
        { fetch: f, log: vi.fn(), privateOk: true }
      )
      expect(found).toEqual([{ url: 'http://192.168.1.5:8000/stream', codec: 'mp3' }])
    })

    it('an entry that redirects there is dropped, not kept as it was', async () => {
      const f = fakeFetch({
        [plsUrl]: { body: '[playlist]\nFile1=http://x.example/a\n' },
        'http://x.example/a': { redirect: 'http://127.0.0.1/stream' }
      })
      const log = vi.fn()
      expect(await findStreams({ pls: [plsUrl], streams: [] }, { fetch: f, log })).toEqual([])
      expect(f.calls.join()).not.toMatch(/127\.0\.0\.1/)
    })
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
    const saved = [{ url: 'http://metalonly.spcast.eu/stream', bitrate: 192, codec: 'mp3' }]
    const found = await findStreams({ pls: [plsUrl], streams: saved }, { fetch: f, log })
    expect(found).toEqual([])
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('logs a status page that answers 404', async () => {
    const f = fakeFetch({ [statusUrl]: { status: 404 } })
    const log = vi.fn()
    const saved = [{ url: 'http://metalonly.spcast.eu/stream', bitrate: 192, codec: 'mp3' }]
    expect(await findStreams({ streams: saved }, { fetch: f, log })).toEqual([])
    expect(log).toHaveBeenCalledOnce()
  })
})

describe('a saved stream with missing data', () => {
  const mount = (name: string, br: number): object => ({
    listenurl: `http://a.example/${name}`,
    bitrate: br,
    server_type: 'audio/mpeg'
  })

  it('gets its bitrate and codec from the probe, so a repeat mount is skipped', async () => {
    const f = fakeFetch({
      'http://a.example/stream': {
        headers: { 'icy-br': '128', 'content-type': 'audio/mpeg' }
      },
      'http://a.example/status-json.xsl': {
        body: JSON.stringify({
          icestats: { source: [mount('autodj', 128), mount('low', 64)] }
        })
      }
    })
    const saved = [{ url: 'http://a.example/stream' }]
    const found = await findStreams({ streams: saved }, { fetch: f, log: vi.fn() })
    expect(found).toEqual([
      { url: 'http://a.example/stream', bitrate: 128, codec: 'mp3' },
      { url: 'http://a.example/low', bitrate: 64, codec: 'mp3' }
    ])
    // what the store does with it
    expect(mergeStreams(saved, found)).toEqual(found)
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
