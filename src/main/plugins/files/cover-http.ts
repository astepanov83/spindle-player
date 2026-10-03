// Every request the online cover lookup makes goes through here (ticket 014):
// one limiter per service, a timeout, and only pictures from the services' own hosts.
import { gaps, RateLimit, type Limiter } from './rate'

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

// No connection, a timeout, a server error or an answer that makes no sense:
// the lookup tries again later and stores nothing.
export class NetError extends Error {}
// 429 or 503: the service's limiter backs off before the next try.
export class BusyError extends Error {}

export interface HttpDeps {
  fetch: FetchLike
  sleep: (ms: number, signal: AbortSignal) => Promise<void>
  userAgent: string
  limits: Record<Limiter, RateLimit>
  timeoutMs?: number
}

export const maxImage = 10 * 1024 * 1024
const maxJson = 2 * 1024 * 1024
// Cover Art Archive sends a picture on to archive.org in one or two hops
const maxRedirects = 3

export function defaultLimits(): Record<Limiter, RateLimit> {
  return {
    musicbrainz: new RateLimit(gaps.musicbrainz),
    deezer: new RateLimit(gaps.deezer),
    itunes: new RateLimit(gaps.itunes),
    caa: new RateLimit(gaps.caa)
  }
}

export function allowedImageHost(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const h = u.hostname
  const under = (d: string): boolean => h === d || h.endsWith('.' + d)
  // Cover Art Archive sends its pictures on to archive.org
  return (
    h === 'coverartarchive.org' ||
    under('archive.org') ||
    h.endsWith('.dzcdn.net') ||
    h.endsWith('.mzstatic.com')
  )
}

const isImage = (b: Uint8Array): boolean =>
  (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)

// The body, or undefined past `max` bytes. The header's length is not trusted.
export async function readCapped(res: Response, max: number): Promise<Uint8Array | undefined> {
  if (!res.body) return new Uint8Array()
  const parts: Uint8Array[] = []
  let size = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) {
      await reader.cancel()
      return undefined
    }
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export class CoverHttp {
  constructor(readonly d: HttpDeps) {}

  // The answer, undefined for a 4xx (not there), or throws NetError or BusyError.
  // A stop (the setting turned off, a scan) throws the abort as it is.
  // manual: a redirect comes back as it is, for the caller to check
  async #get(
    url: string,
    limiter: Limiter,
    signal: AbortSignal,
    redirect: RequestRedirect = 'follow'
  ): Promise<Response | undefined> {
    const limit = this.d.limits[limiter]
    await this.d.sleep(limit.take(), signal)
    signal.throwIfAborted()
    let res: Response
    try {
      res = await this.d.fetch(url, {
        headers: { 'User-Agent': this.d.userAgent },
        redirect,
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.d.timeoutMs ?? 15000)])
      })
    } catch (e) {
      if (signal.aborted) throw e
      throw new NetError(`${limiter}: ${e}`)
    }
    if (res.status === 429 || res.status === 503 || (res.status === 403 && limiter === 'itunes')) {
      limit.tooMany()
      throw new BusyError(`${limiter}: ${res.status}`)
    }
    if (res.status >= 500) throw new NetError(`${limiter}: ${res.status}`)
    limit.ok()
    if (redirect === 'manual' && res.status >= 300 && res.status < 400) return res
    return res.ok ? res : undefined
  }

  async #body(res: Response, max: number, limiter: Limiter): Promise<Uint8Array | undefined> {
    try {
      return await readCapped(res, max)
    } catch (e) {
      throw new NetError(`${limiter}: ${e}`)
    }
  }

  async json(url: string, limiter: Limiter, signal: AbortSignal): Promise<unknown> {
    const res = await this.#get(url, limiter, signal)
    // A search always exists, so a 4xx is a refusal, not "nothing found":
    // iTunes answers 403 when it throttles.
    if (!res) throw new NetError(`${limiter}: search refused`)
    const bytes = await this.#body(res, maxJson, limiter)
    try {
      if (!bytes) throw new Error('too big')
      return JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      // an outage page or a Wi-Fi sign-in page, not a real answer
      throw new NetError(`${limiter}: not a JSON answer`)
    }
  }

  async image(url: string, limiter: Limiter, signal: AbortSignal): Promise<Uint8Array | undefined> {
    // Redirects are followed by hand: one may lead anywhere, and a host
    // that is not the services' own is never asked.
    let res: Response | undefined
    for (let hop = 0; ; hop++) {
      if (!allowedImageHost(url)) return undefined
      res = await this.#get(url, limiter, signal, 'manual')
      const to = res?.status && res.status >= 300 && res.status < 400 && res.headers.get('location')
      if (!to) break
      if (hop === maxRedirects) return undefined
      url = new URL(to, url).href
    }
    if (!res || !allowedImageHost(res.url || url)) return undefined
    const bytes = await this.#body(res, maxImage, limiter)
    return bytes && isImage(bytes) ? bytes : undefined
  }
}
