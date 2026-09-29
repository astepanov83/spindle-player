import { describe, expect, it, vi } from 'vitest'
import type { Station } from '../../shared/stations'
import { RadioStreams, radioStream, type RadioOptions } from './stream'

const station: Station = {
  id: 'metal-only',
  name: 'Metal Only',
  tags: [],
  streams: [{ url: 'http://a.example/64' }, { url: 'http://a.example/320' }]
}

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s)

function block(text: string): Uint8Array {
  const b = bytes(text)
  const out = new Uint8Array(1 + Math.ceil(b.length / 16) * 16)
  out[0] = (out.length - 1) / 16
  out.set(b, 1)
  return out
}

// A server's body that gives these chunks, then stays open or ends.
// `cancelled` is set when the reader is dropped.
function body(
  chunks: Uint8Array[],
  end = true
): { stream: ReadableStream<Uint8Array>; cancelled: () => boolean } {
  let cancelled = false
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(chunks[i++])
      else if (end) c.close()
      else return new Promise(() => {})
      return undefined
    },
    cancel() {
      cancelled = true
    }
  })
  return { stream, cancelled: () => cancelled }
}

function setup(answer: (url: string, init: RequestInit) => Promise<Response>): {
  o: RadioOptions
  titles: string[]
  logs: string[]
  calls: { url: string; init: RequestInit }[]
} {
  const titles: string[] = []
  const logs: string[] = []
  const calls: { url: string; init: RequestInit }[] = []
  const o: RadioOptions = {
    lookup: (id) => (id === station.id ? station : undefined),
    fetch: ((url: string, init: RequestInit) => {
      calls.push({ url, init })
      return answer(url, init)
    }) as typeof fetch,
    onTitle: (id, title) => titles.push(`${id}: ${title}`),
    log: (t) => logs.push(t),
    userAgent: 'Spindle/1.0'
  }
  return { o, titles, logs, calls }
}

async function readAll(res: Response): Promise<string> {
  return new TextDecoder().decode(await res.arrayBuffer())
}

describe('radioStream', () => {
  it('answers 404 for an unknown station or stream', async () => {
    const { o, calls } = setup(async () => new Response('x'))
    expect((await radioStream('nope', '0', o)).status).toBe(404)
    expect((await radioStream('metal-only', '2', o)).status).toBe(404)
    expect((await radioStream('metal-only', 'x', o)).status).toBe(404)
    expect((await radioStream('metal-only', null, o)).status).toBe(404)
    expect(calls).toEqual([])
  })

  it('asks for the titles and passes the audio on without them', async () => {
    const { o, titles, calls } = setup(
      async () =>
        new Response(
          body([
            bytes('abcd'),
            block("StreamTitle='A - B';"),
            bytes('efgh'),
            new Uint8Array([0]),
            bytes('ij')
          ]).stream,
          { headers: { 'content-type': 'audio/mpeg', 'icy-metaint': '4' } }
        )
    )
    const res = await radioStream('metal-only', '1', o)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(await readAll(res)).toBe('abcdefghij')
    expect(titles).toEqual(['metal-only: A - B'])
    expect(calls[0].url).toBe('http://a.example/320')
    const h = new Headers(calls[0].init.headers)
    expect(h.get('icy-metadata')).toBe('1')
    expect(h.get('user-agent')).toBe('Spindle/1.0')
  })

  it('sends a title again only when it changes', async () => {
    const { o, titles } = setup(
      async () =>
        new Response(
          body([
            bytes('ab'),
            block("StreamTitle='A - B';"),
            bytes('cd'),
            block("StreamTitle='A - B';"),
            bytes('ef'),
            block("StreamTitle='C - D';"),
            bytes('gh')
          ]).stream,
          { headers: { 'content-type': 'audio/mpeg', 'icy-metaint': '2' } }
        )
    )
    await readAll(await radioStream('metal-only', '0', o))
    expect(titles).toEqual(['metal-only: A - B', 'metal-only: C - D'])
  })

  it('says a stream opened only when the answer is audio (final fix 6)', async () => {
    const opened: string[] = []
    const { o } = setup(async (url) =>
      url.endsWith('/64')
        ? new Response('bad', { status: 502 })
        : new Response(body([bytes('ab')]).stream, { headers: { 'content-type': 'audio/mpeg' } })
    )
    o.opened = (id, url) => opened.push(`${id} ${url}`)
    expect((await radioStream('metal-only', '0', o)).status).toBe(502)
    expect((await radioStream('metal-only', '9', o)).status).toBe(404)
    expect(opened).toEqual([])
    const res = await radioStream('metal-only', '1', o)
    expect(opened).toEqual(['metal-only http://a.example/320'])
    await res.body!.cancel()
  })

  it('answers 502 for an error status and logs why', async () => {
    const { o, logs } = setup(async () => new Response('gone', { status: 404 }))
    expect((await radioStream('metal-only', '0', o)).status).toBe(502)
    expect(logs.join()).toMatch(/404/)
  })

  it('answers 502 for an answer that is not audio', async () => {
    const { o, logs } = setup(
      async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })
    )
    expect((await radioStream('metal-only', '0', o)).status).toBe(502)
    expect(logs.join()).toMatch(/text\/html/)
  })

  it('answers 502 when the request fails', async () => {
    const { o, logs } = setup(async () => {
      throw new Error('ECONNREFUSED')
    })
    expect((await radioStream('metal-only', '0', o)).status).toBe(502)
    expect(logs.join()).toMatch(/ECONNREFUSED/)
  })

  it('answers 502 when there is no answer in time, and stops the request', async () => {
    let signal: AbortSignal | undefined
    const { o, logs } = setup(
      (_, init) =>
        new Promise((_, reject) => {
          signal = init.signal!
          signal.addEventListener('abort', () => reject(signal!.reason))
        })
    )
    const res = await radioStream('metal-only', '0', { ...o, timeoutMs: 20 })
    expect(res.status).toBe(502)
    expect(signal?.aborted).toBe(true)
    expect(logs.join()).toMatch(/no answer/)
  })

  it('stops the request at once when the page closes it', async () => {
    let signal: AbortSignal | undefined
    const server = body([bytes('abcd'), bytes('efgh')], false)
    const { o, logs } = setup(async (_, init) => {
      signal = init.signal!
      return new Response(server.stream, { headers: { 'content-type': 'audio/mpeg' } })
    })
    const res = await radioStream('metal-only', '0', o)
    const reader = res.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('abcd')
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('efgh')
    // a read still waiting on the server when the page closes
    await new Promise((r) => setTimeout(r, 0))
    await reader.cancel()
    await new Promise((r) => setTimeout(r, 0))
    expect(signal?.aborted).toBe(true)
    expect(server.cancelled()).toBe(true)
    // not also "the server ended the stream"
    expect(logs).toEqual([expect.stringMatching(/closed by the page after \d+ bytes/)])
  })

  it('fails the answer and logs why when the connection drops', async () => {
    let n = 0
    const broken = new ReadableStream<Uint8Array>({
      pull(c) {
        if (n++ === 0) c.enqueue(bytes('ab'))
        else c.error(new Error('ECONNRESET'))
      }
    })
    const { o, logs } = setup(
      async () => new Response(broken, { headers: { 'content-type': 'audio/mpeg' } })
    )
    const res = await radioStream('metal-only', '0', o)
    await expect(res.arrayBuffer()).rejects.toThrow()
    expect(logs.join()).toMatch(/ECONNRESET/)
  })

  it('ends the answer when the server ends the stream', async () => {
    const { o } = setup(
      async () =>
        new Response(body([bytes('ab')]).stream, { headers: { 'content-type': 'audio/aac' } })
    )
    expect(await readAll(await radioStream('metal-only', '0', o))).toBe('ab')
  })

  describe('a Shoutcast v1 server (ICY 200 OK, no headers)', () => {
    const head = 'ICY 200 OK\r\nicy-name:X\r\ncontent-type:audio/mpeg\r\nicy-metaint:4\r\n\r\n'

    it('reads the head from the body, even split, and uses its type and metaint', async () => {
      const { o, titles } = setup(
        async () =>
          new Response(
            body([
              bytes(head.slice(0, 15)),
              bytes(head.slice(15) + 'ab'),
              bytes('cd'),
              block("StreamTitle='Old - Song';"),
              bytes('ef')
            ]).stream
          )
      )
      const res = await radioStream('metal-only', '0', o)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('audio/mpeg')
      expect(await readAll(res)).toBe('abcdef')
      expect(titles).toEqual(['metal-only: Old - Song'])
    })

    it('answers 502 for a refusal', async () => {
      const { o, logs } = setup(
        async () => new Response(body([bytes('ICY 401 Service Unavailable\r\n\r\n')]).stream)
      )
      expect((await radioStream('metal-only', '0', o)).status).toBe(502)
      expect(logs.join()).toMatch(/401/)
    })

    it('answers 502 for a head that never ends', async () => {
      const { o } = setup(
        async () => new Response(body([bytes('ICY 200 OK\r\n' + 'x'.repeat(20000))]).stream)
      )
      expect((await radioStream('metal-only', '0', o)).status).toBe(502)
    })
  })

  it('passes a body with no type and no ICY head as it is', async () => {
    const { o } = setup(async () => new Response(body([bytes('ID3xyz')]).stream))
    const res = await radioStream('metal-only', '0', o)
    expect(res.status).toBe(200)
    expect(await readAll(res)).toBe('ID3xyz')
  })

  it('does not leave its timer running once the answer came', async () => {
    vi.useFakeTimers()
    try {
      const { o } = setup(
        async () =>
          new Response(body([bytes('ab')]).stream, { headers: { 'content-type': 'audio/mpeg' } })
      )
      await radioStream('metal-only', '0', o)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  describe('RadioStreams (ticket 027)', () => {
    const audio = (): Response =>
      new Response(body([bytes('abcd'), bytes('efgh')], false).stream, {
        headers: { 'content-type': 'audio/mpeg' }
      })

    it('keeps what it last answered for each station, and how much audio it passed', async () => {
      const streams = new RadioStreams()
      const { o } = setup(async (url) => {
        if (url.endsWith('/64')) throw new Error('ECONNREFUSED')
        return audio()
      })
      o.streams = streams
      expect(streams.lastAnswer('metal-only')).toBeUndefined()
      await radioStream('metal-only', '0', o)
      expect(streams.lastAnswer('metal-only')).toEqual({ ok: false, bytes: 0 })
      const res = await radioStream('metal-only', '1', o)
      expect(streams.lastAnswer('metal-only')).toEqual({ ok: true, bytes: 0 })
      const reader = res.body!.getReader()
      await reader.read()
      await reader.read()
      expect(streams.lastAnswer('metal-only')).toEqual({ ok: true, bytes: 8 })
      await reader.cancel()
    })

    it('records a 404 too, so an older answer is not taken for this one', async () => {
      const streams = new RadioStreams()
      const { o } = setup(async () => audio())
      o.streams = streams
      const res = await radioStream('metal-only', '0', o)
      await res.body!.cancel()
      expect(streams.lastAnswer('metal-only')?.ok).toBe(true)
      expect((await radioStream('metal-only', '9', o)).status).toBe(404)
      expect(streams.lastAnswer('metal-only')).toEqual({ ok: false, bytes: 0 })
    })

    it('forgets the last answer while a new request waits for its server (final fix 1)', async () => {
      const streams = new RadioStreams()
      let hang = false
      const { o } = setup(() => (hang ? new Promise<Response>(() => {}) : Promise.resolve(audio())))
      o.streams = streams
      const res = await radioStream('metal-only', '0', o)
      const reader = res.body!.getReader()
      await reader.read()
      await reader.read()
      expect(streams.lastAnswer('metal-only')).toEqual({ ok: true, bytes: 8 })
      await reader.cancel()
      // the server now takes the connection and never answers
      hang = true
      void radioStream('metal-only', '0', o)
      expect(streams.lastAnswer('metal-only')).toEqual({ ok: false, bytes: 0 })
      streams.stop()
    })

    it('a new request stops the one still waiting for its server', async () => {
      const streams = new RadioStreams()
      let first: AbortSignal | undefined
      const { o, logs } = setup((url, init) => {
        if (url.endsWith('/320')) return Promise.resolve(audio())
        first = init.signal!
        return new Promise((_, reject) =>
          first!.addEventListener('abort', () => reject(first!.reason))
        )
      })
      o.streams = streams
      const waiting = radioStream('metal-only', '0', o)
      await new Promise((r) => setTimeout(r, 0))
      const res = await radioStream('metal-only', '1', o)
      expect(first?.aborted).toBe(true)
      expect((await waiting).status).toBe(502)
      expect(logs.join()).toMatch(/another radio request came/)
      // the answer of the newer one is the one kept
      expect(streams.lastAnswer('metal-only')?.ok).toBe(true)
      await res.body!.cancel()
    })

    it('stop() ends the stream passing audio, for a pause', async () => {
      const streams = new RadioStreams()
      const signals: AbortSignal[] = []
      const { o } = setup(async (_, init) => {
        signals.push(init.signal!)
        return audio()
      })
      o.streams = streams
      const res = await radioStream('metal-only', '0', o)
      const reader = res.body!.getReader()
      await reader.read()
      streams.stop()
      expect(signals[0].aborted).toBe(true)
      await reader.read()
      expect((await reader.read()).done).toBe(true)
      // nothing left to stop
      streams.stop()
    })

    it('a new request stops one that is still passing audio', async () => {
      const streams = new RadioStreams()
      const signals: AbortSignal[] = []
      const { o, logs } = setup(async (_, init) => {
        signals.push(init.signal!)
        return audio()
      })
      o.streams = streams
      const old = await radioStream('metal-only', '0', o)
      const reader = old.body!.getReader()
      await reader.read()
      const res = await radioStream('metal-only', '1', o)
      expect(signals[0].aborted).toBe(true)
      expect(signals[1].aborted).toBe(false)
      // the old answer just ends; it is not the server's doing
      await reader.read()
      expect(logs.join('\n')).not.toMatch(/failed|ended the stream/)
      await res.body!.cancel()
    })
  })
})
