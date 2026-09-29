import { EventEmitter } from 'events'
import type { ClientRequest, ClientRequestConstructorOptions } from 'electron'
import { describe, expect, it } from 'vitest'
import { checkedFetch, maxRedirects } from './checked-fetch'

// A stand-in for net.request: redirects to follow, then an answer.
class FakeRequest extends EventEmitter {
  headers: Record<string, string> = {}
  followed = 0
  aborted = false
  constructor(
    readonly opts: ClientRequestConstructorOptions,
    readonly hops: string[],
    readonly res: FakeResponse
  ) {
    super()
  }
  setHeader(k: string, v: string): void {
    this.headers[k] = v
  }
  end(): void {
    queueMicrotask(() => this.#next())
  }
  followRedirect(): void {
    this.followed++
    queueMicrotask(() => this.#next())
  }
  abort(): void {
    this.aborted = true
  }
  #next(): void {
    if (this.aborted) return
    const to = this.hops[this.followed]
    if (to) this.emit('redirect', 302, 'GET', to, {})
    else this.emit('response', this.res)
  }
}

class FakeResponse extends EventEmitter {
  paused = false
  constructor(
    readonly statusCode = 200,
    readonly headers: Record<string, string | string[]> = { 'content-type': 'image/png' }
  ) {
    super()
  }
  pause(): void {
    this.paused = true
  }
  resume(): void {
    this.paused = false
  }
}

interface FakeNet {
  request: (o: ClientRequestConstructorOptions) => ClientRequest
  made: FakeRequest[]
  res: FakeResponse
}
function net(hops: string[] = [], res = new FakeResponse()): FakeNet {
  const made: FakeRequest[] = []
  const request = (o: ClientRequestConstructorOptions): ClientRequest => {
    const r = new FakeRequest(o, hops, res)
    made.push(r)
    return r as unknown as ClientRequest
  }
  return { request, made, res }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('checkedFetch', () => {
  it('asks with manual redirects and the caller’s headers, and gives the body', async () => {
    const n = net()
    const f = checkedFetch(n.request, false)
    const p = f('https://a.example/l.png', { headers: { 'User-Agent': 'Spindle/test' } })
    await tick()
    n.res.emit('data', Buffer.from([1, 2]))
    n.res.emit('data', Buffer.from([3]))
    n.res.emit('end')
    const res = await p
    expect(n.made[0].opts).toMatchObject({ url: 'https://a.example/l.png', redirect: 'manual' })
    expect(n.made[0].headers).toEqual({ 'user-agent': 'Spindle/test' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('follows redirects on the web and says where it ended up', async () => {
    const n = net(['https://b.example/x', 'https://c.example/y'])
    const p = checkedFetch(n.request, false)('https://a.example/')
    await tick()
    await tick()
    await tick()
    n.res.emit('end')
    const res = await p
    expect(n.made[0].followed).toBe(2)
    expect(res.url).toBe('https://c.example/y')
  })

  it('refuses a redirect to the local network before it is asked', async () => {
    const n = net(['http://192.168.1.1/admin'])
    await expect(checkedFetch(n.request, false)('https://a.example/')).rejects.toThrow(
      /local network/
    )
    expect(n.made[0].followed).toBe(0)
    expect(n.made[0].aborted).toBe(true)
  })

  it('follows it for a station on the local network', async () => {
    const n = net(['http://192.168.1.1/logo.png'])
    const p = checkedFetch(n.request, true)('http://192.168.1.1/')
    await tick()
    await tick()
    n.res.emit('end')
    expect((await p).url).toBe('http://192.168.1.1/logo.png')
  })

  it('refuses a local address, or one that is not http(s), without asking', async () => {
    const n = net()
    const f = checkedFetch(n.request, false)
    await expect(f('http://127.0.0.1/')).rejects.toThrow(/local network/)
    await expect(f('file:///etc/passwd')).rejects.toThrow(/not a web address/)
    expect(n.made).toHaveLength(0)
  })

  it('stops after too many redirects', async () => {
    const hops = Array.from({ length: maxRedirects + 1 }, (_, i) => `https://a.example/${i}`)
    const n = net(hops)
    await expect(checkedFetch(n.request, false)('https://a.example/')).rejects.toThrow(
      /too many redirects/
    )
    expect(n.made[0].aborted).toBe(true)
  })

  it('stops the request when the caller stops, before or after the answer', async () => {
    const n = net()
    const stop = new AbortController()
    const p = checkedFetch(n.request, false)('https://a.example/', { signal: stop.signal })
    stop.abort(new Error('timed out'))
    await expect(p).rejects.toThrow(/timed out/)
    expect(n.made[0].aborted).toBe(true)

    const n2 = net()
    const stop2 = new AbortController()
    const p2 = checkedFetch(n2.request, false)('https://a.example/', { signal: stop2.signal })
    await tick()
    const res = await p2
    stop2.abort(new Error('timed out'))
    await expect(res.arrayBuffer()).rejects.toThrow(/timed out/)
    expect(n2.made[0].aborted).toBe(true)
  })

  it('stops the request when the reader cancels (a page read only in part)', async () => {
    const n = net([], new FakeResponse(200, { 'content-type': 'text/html' }))
    const p = checkedFetch(n.request, false)('https://a.example/')
    await tick()
    const res = await p
    n.res.emit('data', Buffer.from('<html>'))
    const reader = res.body!.getReader()
    await reader.read()
    await reader.cancel()
    expect(n.made[0].aborted).toBe(true)
    // late data after the cancel is dropped
    n.res.emit('data', Buffer.from('more'))
  })

  it('fails on a connection error', async () => {
    const n = net()
    const p = checkedFetch(n.request, false)('https://a.example/')
    n.made[0].emit('error', new Error('net::ERR_NAME_NOT_RESOLVED'))
    await expect(p).rejects.toThrow(/ERR_NAME_NOT_RESOLVED/)
  })

  it('gives an answer with no body for 204 and 304', async () => {
    const n = net([], new FakeResponse(304, {}))
    const p = checkedFetch(n.request, false)('https://a.example/')
    await tick()
    const res = await p
    expect(res.status).toBe(304)
    expect(res.body).toBeNull()
  })
})
