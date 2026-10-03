import { describe, expect, it } from 'vitest'
import { onlineMedia, type OnlineMediaOptions } from './media'

const url = 'https://datashat.net/x.mp3'

// A fake host: answers with `bytes` of a 1000-byte file, honoring one Range.
function host(over: { status?: number; type?: string | null; fail?: Error } = {}): {
  fetch: OnlineMediaOptions['fetch']
  asked: RequestInit[]
  cancelled: { yes: boolean }
} {
  const asked: RequestInit[] = []
  const cancelled = { yes: false }
  const fetch = (async (_u: string, init: RequestInit) => {
    asked.push(init)
    if (over.fail) throw over.fail
    const range = new Headers(init.headers).get('Range')
    const headers = new Headers({ 'Accept-Ranges': 'bytes' })
    if (over.type !== null) headers.set('Content-Type', over.type ?? 'audio/mpeg')
    const status = over.status ?? (range ? 206 : 200)
    if (status === 206) {
      headers.set('Content-Range', 'bytes 100-199/1000')
      headers.set('Content-Length', '100')
    } else headers.set('Content-Length', '1000')
    const body =
      init.method === 'HEAD'
        ? null
        : new ReadableStream<Uint8Array>({
            pull(c) {
              c.enqueue(new Uint8Array(10))
            },
            cancel() {
              cancelled.yes = true
            }
          })
    return new Response(body, { status, headers })
  }) as unknown as OnlineMediaOptions['fetch']
  return { fetch, asked, cancelled }
}

const opts = (fetch: OnlineMediaOptions['fetch']): OnlineMediaOptions => ({
  fetch,
  userAgent: 'Spindle/test',
  log: () => {}
})

const req = (headers: Record<string, string> = {}, method = 'GET'): Request =>
  new Request('spindle://media/abc', { method, headers })

describe('onlineMedia', () => {
  it('passes the page Range on and the part back', async () => {
    const h = host()
    const r = await onlineMedia(url, req({ Range: 'bytes=100-199' }), false, opts(h.fetch))
    expect(r.status).toBe(206)
    expect(r.headers.get('Content-Range')).toBe('bytes 100-199/1000')
    expect(r.headers.get('Content-Length')).toBe('100')
    expect(r.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(r.headers.get('Accept-Ranges')).toBe('bytes')
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const sent = new Headers(h.asked[0].headers)
    expect(sent.get('Range')).toBe('bytes=100-199')
    expect(sent.get('User-Agent')).toBe('Spindle/test')
    await r.body?.cancel()
  })

  it('answers a whole-file GET with 200 and its length', async () => {
    const r = await onlineMedia(url, req(), false, opts(host().fetch))
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Length')).toBe('1000')
    expect(r.headers.get('Content-Range')).toBeNull()
    await r.body?.cancel()
  })

  it('answers HEAD with no body, asking the host with HEAD', async () => {
    const h = host()
    const r = await onlineMedia(url, req({}, 'HEAD'), false, opts(h.fetch))
    expect(r.status).toBe(200)
    expect(r.body).toBeNull()
    expect(h.asked[0].method).toBe('HEAD')
  })

  it('stops the download when the page drops the answer', async () => {
    const h = host()
    const r = await onlineMedia(url, req(), false, opts(h.fetch))
    const reader = r.body!.getReader()
    await reader.read()
    await reader.cancel()
    expect(h.cancelled.yes).toBe(true)
  })

  it('says audio/mpeg when the host gives no audio type', async () => {
    for (const type of [null, 'application/octet-stream', 'text/html']) {
      const r = await onlineMedia(url, req(), false, opts(host({ type }).fetch))
      expect(r.headers.get('Content-Type')).toBe('audio/mpeg')
      await r.body?.cancel()
    }
  })

  it('answers 404 when the host fails or says no', async () => {
    for (const h of [
      host({ fail: new Error('ENOTFOUND') }),
      host({ status: 404 }),
      host({ status: 500 })
    ]) {
      const r = await onlineMedia(url, req(), false, opts(h.fetch))
      expect(r.status).toBe(404)
    }
  })

  it('passes a 416 on', async () => {
    const r = await onlineMedia(
      url,
      req({ Range: 'bytes=5000-' }),
      false,
      opts(host({ status: 416 }).fetch)
    )
    expect(r.status).toBe(416)
  })

  it('answers 404 when the host does not answer in time', async () => {
    const never = ((_u: string, init: RequestInit) =>
      new Promise((_, reject) =>
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      )) as unknown as OnlineMediaOptions['fetch']
    const r = await onlineMedia(url, req(), false, { ...opts(never), timeoutMs: 20 })
    expect(r.status).toBe(404)
  })

  it('answers 415 to ?decode: an mp3 never needs it', async () => {
    const h = host()
    const r = await onlineMedia(url, req(), true, opts(h.fetch))
    expect(r.status).toBe(415)
    expect(h.asked).toEqual([])
  })
})
