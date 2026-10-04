// The fetch main uses for logos, homepages and finding a station's streams
// (tickets 030, 029, 033, 025). net.fetch
// can't check a redirect before it is followed ('manual' throws "Redirect was
// cancelled") and leaves Response.url empty, so this goes through net.request:
// each hop's address is checked with refusedAddress before it is asked, and
// the answer's url is where it ended up (homepage icons resolve against it).
import type { ClientRequest, ClientRequestConstructorOptions, IncomingMessage } from 'electron'
import { refusedAddress } from './logo-fetch'

export const maxRedirects = 10

// An address this fetch won't ask: a caller drops what led to it (a stream
// that redirects to the local network is not kept as it was).
export class RefusedAddress extends Error {}

// statuses a Response may not have a body for
const noBody = new Set([101, 204, 205, 304])

export function checkedFetch(
  request: (o: ClientRequestConstructorOptions) => ClientRequest,
  privateOk: boolean
): typeof fetch {
  return (input, init) =>
    new Promise<Response>((resolve, reject) => {
      let url = String(input)
      const refused = refusedAddress(url, privateOk)
      if (refused) return reject(new RefusedAddress(refused))
      const signal = init?.signal ?? undefined
      if (signal?.aborted) return reject(signal.reason)
      const req = request({ url, method: init?.method ?? 'GET', redirect: 'manual' })
      new Headers(init?.headers).forEach((v, k) => req.setHeader(k, v))
      let settled = false
      // after the answer, a stop errors its body instead
      let stopBody: ((e: unknown) => void) | undefined
      const fail = (e: unknown): void => {
        release()
        req.abort()
        if (stopBody) stopBody(e)
        else if (!settled) reject(e)
        settled = true
      }
      const onAbort = (): void => fail(signal?.reason)
      signal?.addEventListener('abort', onAbort, { once: true })
      // the caller's signal is let go once the request or its body is over
      const release = (): void => signal?.removeEventListener('abort', onAbort)
      let hops = 0
      req.on('redirect', (_status, _method, to) => {
        if (++hops > maxRedirects) return fail(new Error('too many redirects'))
        const why = refusedAddress(to, privateOk)
        if (why) return fail(new RefusedAddress(why))
        url = to
        req.followRedirect()
      })
      req.on('error', (e) => fail(e))
      req.on('response', (res) => {
        try {
          resolve(answer(res, url, req, (stop) => (stopBody = stop), release))
          settled = true
        } catch (e) {
          fail(e)
        }
      })
      req.end()
    })
}

function answer(
  res: IncomingMessage,
  url: string,
  req: ClientRequest,
  onStop: (stop: (e: unknown) => void) => void,
  over: () => void
): Response {
  const headers = new Headers()
  for (const [k, v] of Object.entries(res.headers))
    for (const one of Array.isArray(v) ? v : [v]) headers.append(k, one)
  // a Node Readable at run time, though Electron's types don't say so
  const flow = res as unknown as { pause?(): void; resume?(): void }
  let body: ReadableStream<Uint8Array> | null = null
  if (!noBody.has(res.statusCode)) {
    let done = false
    body = new ReadableStream<Uint8Array>({
      start(c) {
        const end = (f: () => void): void => {
          if (done) return
          done = true
          over()
          f()
        }
        onStop((e) => end(() => c.error(e)))
        res.on('data', (chunk: Buffer) => {
          if (done) return
          c.enqueue(new Uint8Array(chunk))
          // wait for the reader (a logo is read whole, a page only in part)
          if ((c.desiredSize ?? 1) <= 0) flow.pause?.()
        })
        res.on('end', () => end(() => c.close()))
        res.on('error', (e) => end(() => c.error(e)))
        res.on('aborted', () => end(() => c.error(new Error('aborted'))))
      },
      pull() {
        flow.resume?.()
      },
      cancel() {
        done = true
        over()
        req.abort()
      }
    })
  } else over()
  const out = new Response(body, { status: res.statusCode, headers })
  Object.defineProperty(out, 'url', { value: url })
  return out
}
