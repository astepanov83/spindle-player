// Fetches one picture from anywhere on the web as a station logo (ticket 030).
// A plain function of a URL: search result rows (029) and homepage icons (033)
// use it too. Same size limit as the online cover lookup, and a timeout.
import { maxImage, readCapped } from '../library/cover-http'

export interface LogoFetchOptions {
  // net.fetch in the app; a fake in tests
  fetch: typeof fetch
  userAgent: string
  timeoutMs?: number
  maxBytes?: number
  // a stop from the caller (029 drops rows scrolled away)
  signal?: AbortSignal
}

const timeoutMs = 15000

const starts = (b: Uint8Array, sig: number[], at = 0): boolean =>
  b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x)

// JPEG, PNG, GIF, WebP and ICO: what station logos and site icons come in, and
// what Chromium decodes. SVG is not one: the cover window can't draw it.
export function isLogoPicture(b: Uint8Array): boolean {
  return (
    starts(b, [0xff, 0xd8, 0xff]) ||
    starts(b, [0x89, 0x50, 0x4e, 0x47]) ||
    starts(b, [0x47, 0x49, 0x46, 0x38]) ||
    (starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8)) ||
    starts(b, [0, 0, 1, 0])
  )
}

// The picture's bytes, or throws with the reason.
export async function fetchLogo(url: string, o: LogoFetchOptions): Promise<Uint8Array> {
  const u = new URL(url)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('not a web address')
  const signal = AbortSignal.timeout(o.timeoutMs ?? timeoutMs)
  const res = await o.fetch(url, {
    headers: { 'User-Agent': o.userAgent },
    redirect: 'follow',
    signal: o.signal ? AbortSignal.any([o.signal, signal]) : signal
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const bytes = await readCapped(res, o.maxBytes ?? maxImage)
  if (!bytes) throw new Error('too big')
  if (!isLogoPicture(bytes)) throw new Error('not a picture')
  return bytes
}
