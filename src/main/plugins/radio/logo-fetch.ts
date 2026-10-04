// Fetches one picture from anywhere on the web as a station logo (ticket 030).
// A plain function of a URL: search result rows (029) and homepage icons (033)
// use it too. Same size limit as the online cover lookup, and a timeout.
import { BlockList, isIP } from 'net'
import { maxImage, readCapped } from '../../read-capped'

export interface LogoFetchOptions {
  // checkedFetch in the app (each redirect checked); a fake in tests
  fetch: typeof fetch
  userAgent: string
  timeoutMs?: number
  maxBytes?: number
  // a stop from the caller (029 drops rows scrolled away)
  signal?: AbortSignal
  // local network addresses too: only for a station that is on one itself
  privateOk?: boolean
}

// Loopback, private and link-local ranges. IPv4 in IPv6 (::ffff:a.b.c.d) is
// checked against the IPv4 ones.
const privateNets = new BlockList()
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16]
] as const)
  privateNets.addSubnet(net, bits, 'ipv4')
for (const [net, bits] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10]
] as const)
  privateNets.addSubnet(net, bits, 'ipv6')

// A host on this machine or the local network, as URL.hostname writes it (the
// parser already turns 0x7f.1 and 2130706433 into 127.0.0.1). Names other
// than localhost are not looked up.
export function privateHost(hostname: string): boolean {
  const h = hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  const v = isIP(h)
  return v !== 0 && privateNets.check(h, v === 4 ? 'ipv4' : 'ipv6')
}

// A web address on the local network (a station's own site or stream).
export function localAddress(url: string | undefined): boolean {
  if (!url) return false
  try {
    return privateHost(new URL(url).hostname)
  } catch {
    return false
  }
}

// Why a logo or homepage address is not asked, or undefined when it may be:
// only http(s), and no local network address unless the caller allows it, so
// a page on the web can't make main ask the user's router or this machine.
export function refusedAddress(url: string, privateOk = false): string | undefined {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'not a web address'
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'not a web address'
  if (!privateOk && privateHost(u.hostname)) return 'a local network address'
  return undefined
}

const timeoutMs = 15000
// A logo bigger than this a side is refused before the cover window decodes
// it: a small file can claim 30000x30000 px and bring the window down, and
// the album covers in it with it.
export const maxLogoSide = 4096

const starts = (b: Uint8Array, sig: number[], at = 0): boolean =>
  b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x)

// The type of a JPEG, PNG, GIF, WebP or ICO: what station logos and site icons
// come in, and what Chromium decodes. SVG is not one: the cover window can't
// draw it. Undefined for anything else.
export function pictureType(b: Uint8Array): string | undefined {
  if (starts(b, [0x89, 0x50, 0x4e, 0x47])) return 'image/png'
  if (starts(b, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (starts(b, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp'
  if (starts(b, [0, 0, 1, 0])) return 'image/x-icon'
  return undefined
}

export const isLogoPicture = (b: Uint8Array): boolean => pictureType(b) !== undefined

export interface PictureSize {
  width: number
  height: number
}

const be16 = (b: Uint8Array, at: number): number => (b[at] << 8) | b[at + 1]
const le16 = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8)
const le24 = (b: Uint8Array, at: number): number => le16(b, at) | (b[at + 2] << 16)
const be32 = (b: Uint8Array, at: number): number => be16(b, at) * 65536 + be16(b, at + 2)

function pngSize(b: Uint8Array, at = 0): PictureSize | undefined {
  // signature, then the IHDR chunk's length and name
  if (b.length < at + 24 || !starts(b, [0x49, 0x48, 0x44, 0x52], at + 12)) return undefined
  return { width: be32(b, at + 16), height: be32(b, at + 20) }
}

// Walks the JPEG's segments to the frame header (SOF0-SOF15, but not DHT,
// JPG or DAC, which share the range).
function jpegSize(b: Uint8Array): PictureSize | undefined {
  let at = 2
  while (at + 3 < b.length) {
    if (b[at] !== 0xff) return undefined
    const m = b[at + 1]
    // fill bytes, and markers with no length
    if (m === 0xff) {
      at++
      continue
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd9)) {
      at += 2
      continue
    }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (at + 8 >= b.length) return undefined
      return { width: be16(b, at + 7), height: be16(b, at + 5) }
    }
    at += 2 + be16(b, at + 2)
  }
  return undefined
}

function webpSize(b: Uint8Array): PictureSize | undefined {
  const chunk = String.fromCharCode(...b.subarray(12, 16))
  if (chunk === 'VP8 ' && b.length >= 30)
    return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff }
  if (chunk === 'VP8L' && b.length >= 25) {
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X' && b.length >= 30) return { width: le24(b, 24) + 1, height: le24(b, 27) + 1 }
  return undefined
}

// The biggest picture in the icon. A PNG inside counts with its own size,
// since the 0 in the list only means "256 or more".
function icoSize(b: Uint8Array): PictureSize | undefined {
  const count = le16(b, 4)
  if (!count || b.length < 6 + count * 16) return undefined
  let out: PictureSize = { width: 0, height: 0 }
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16
    let size: PictureSize | undefined = { width: b[e] || 256, height: b[e + 1] || 256 }
    const offset = le16(b, e + 12) + le16(b, e + 14) * 65536
    if (starts(b, [0x89, 0x50, 0x4e, 0x47], offset)) size = pngSize(b, offset)
    if (!size) return undefined
    if (size.width * size.height > out.width * out.height) out = size
  }
  return out
}

// The picture's size in px from its header, undefined when it can't be read.
export function pictureSize(b: Uint8Array): PictureSize | undefined {
  if (starts(b, [0x89, 0x50, 0x4e, 0x47])) return pngSize(b)
  if (starts(b, [0xff, 0xd8, 0xff])) return jpegSize(b)
  if (starts(b, [0x47, 0x49, 0x46, 0x38]))
    return b.length >= 10 ? { width: le16(b, 6), height: le16(b, 8) } : undefined
  if (starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8))
    return webpSize(b)
  if (starts(b, [0, 0, 1, 0])) return icoSize(b)
  return undefined
}

// The picture's bytes, or throws with the reason.
export async function fetchLogo(url: string, o: LogoFetchOptions): Promise<Uint8Array> {
  const refused = refusedAddress(url, o.privateOk)
  if (refused) throw new Error(refused)
  const signal = AbortSignal.timeout(o.timeoutMs ?? timeoutMs)
  const res = await o.fetch(url, {
    headers: { 'User-Agent': o.userAgent },
    redirect: 'follow',
    signal: o.signal ? AbortSignal.any([o.signal, signal]) : signal
  })
  if (!res.ok) {
    // else the request waits, paused, for its timeout
    await res.body?.cancel().catch(() => {})
    throw new Error(`HTTP ${res.status}`)
  }
  // where it ended up; the app's fetch checks each redirect before it is followed
  const landed = res.url && refusedAddress(res.url, o.privateOk)
  if (landed) {
    await res.body?.cancel().catch(() => {})
    throw new Error(landed)
  }
  const bytes = await readCapped(res, o.maxBytes ?? maxImage)
  if (!bytes) throw new Error('too big')
  if (!isLogoPicture(bytes)) throw new Error('not a picture')
  const size = pictureSize(bytes)
  if (!size) throw new Error('no size in the picture')
  if (size.width > maxLogoSide || size.height > maxLogoSide)
    throw new Error(`too many pixels (${size.width}x${size.height})`)
  return bytes
}
