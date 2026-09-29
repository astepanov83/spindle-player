// A logo for a station that has none, from the icons on its homepage (ticket
// 033). The page is only read as text and scanned for <link> and <meta> tags;
// nothing in it runs. Each icon goes through fetchLogo, so the same type, size
// and pixel checks hold as for a logo address.
import { smallLogoSide } from '../../shared/stations'
import { fetchLogo, pictureSize } from './logo-fetch'

export interface SiteLogoOptions {
  // net.fetch in the app; a fake in tests
  fetch: typeof fetch
  userAgent: string
  // for the page, and for each icon
  timeoutMs?: number
}

const timeoutMs = 10000
// Icons are in the <head>; a page past this is cut, not refused.
const maxPageBytes = 512 * 1024
// Icons downloaded per homepage at most, so a page with many icons that all
// fail or are small costs a few requests, not dozens.
export const maxIconTries = 6

const isWeb = (u: URL): boolean => u.protocol === 'http:' || u.protocol === 'https:'

function webUrl(href: string | undefined, base: string): URL | undefined {
  if (!href) return undefined
  try {
    const u = new URL(href.trim(), base)
    return isWeb(u) ? u : undefined
  } catch {
    return undefined
  }
}

const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }

function decode(v: string): string {
  return v.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] !== '#') return named[e.toLowerCase()] ?? all
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all
  })
}

interface Tag {
  name: string
  attrs: Map<string, string>
}

// <link>, <meta> and <base> tags outside comments, scripts and styles.
function tags(html: string): Tag[] {
  const text = html
    .replace(/<!--[\s\S]*?(-->|$)/g, '')
    .replace(/<(script|style|template)\b[\s\S]*?(<\/\1\s*>|$)/gi, '')
  const out: Tag[] = []
  // A tag never runs past the next '<', so a page of unclosed tags is scanned
  // in one pass, not once per tag (this runs in main).
  for (const m of text.matchAll(/<(link|meta|base)\b((?:[^<>"']|"[^<>"]*"|'[^<>']*')*)>/gi)) {
    const attrs = new Map<string, string>()
    for (const a of m[2].matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g))
      attrs.set(a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? ''))
    out.push({ name: m[1].toLowerCase(), attrs })
  }
  return out
}

// The biggest side a sizes="16x16 32x32" names, by the shorter side of each.
function sizesHint(sizes: string | undefined): number | undefined {
  let best: number | undefined
  for (const m of (sizes ?? '').matchAll(/(\d+)\s*x\s*(\d+)/gi)) {
    const side = Math.min(Number(m[1]), Number(m[2]))
    if (side > (best ?? 0)) best = side
  }
  return best
}

const isSvg = (u: URL, type: string | undefined): boolean =>
  /svg/i.test(type ?? '') || /\.svgz?$/i.test(u.pathname)

interface Candidate {
  url: string
  // the side the page says it has, if it says
  hint?: number
  // for unsized ones: apple-touch-icon, og:image, icon
  rank: number
}

// The icons to try, in order: sized ones of 64px or more (biggest first),
// then the unsized ones (apple-touch-icon, og:image, icon), then the small
// sized ones, then /favicon.ico. Relative addresses are resolved against the
// base href, else the page's own address (where it ended up after redirects).
export function iconCandidates(html: string, pageUrl: string): string[] {
  const found = tags(html)
  const baseTag = found.find((t) => t.name === 'base' && t.attrs.get('href'))
  const base = webUrl(baseTag?.attrs.get('href'), pageUrl)?.href ?? pageUrl
  const meta = (p: string): string | undefined =>
    found
      .find((t) => t.name === 'meta' && (t.attrs.get('property') ?? t.attrs.get('name')) === p)
      ?.attrs.get('content')

  const list: Candidate[] = []
  const add = (
    href: string | undefined,
    type: string | undefined,
    rank: number,
    hint?: number
  ): void => {
    const u = webUrl(href, base)
    if (u && !isSvg(u, type)) list.push({ url: u.href, hint, rank })
  }
  for (const t of found) {
    if (t.name !== 'link') continue
    const rel = (t.attrs.get('rel') ?? '').toLowerCase().split(/\s+/)
    const hint = sizesHint(t.attrs.get('sizes'))
    const href = t.attrs.get('href')
    if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed'))
      add(href, t.attrs.get('type'), 0, hint)
    else if (rel.includes('icon')) add(href, t.attrs.get('type'), 2, hint)
  }
  const og = meta('og:image') ?? meta('og:image:url') ?? meta('og:image:secure_url')
  const w = Number(meta('og:image:width'))
  const h = Number(meta('og:image:height'))
  add(og, meta('og:image:type'), 1, w > 0 && h > 0 ? Math.min(w, h) : undefined)

  const group = (c: Candidate): number =>
    c.hint === undefined ? 1 : c.hint >= smallLogoSide ? 0 : 2
  const sorted = list
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        group(a.c) - group(b.c) ||
        (b.c.hint ?? 0) - (a.c.hint ?? 0) ||
        a.c.rank - b.c.rank ||
        a.i - b.i
    )
    .map(({ c }) => c.url)
  const out = [...new Set(sorted)]
  const favicon = new URL('/favicon.ico', pageUrl).href
  if (!out.includes(favicon)) out.push(favicon)
  return out
}

// The first maxPageBytes of the body; the rest is not read.
async function readHead(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const out = new Uint8Array(maxPageBytes)
  let size = 0
  while (size < maxPageBytes) {
    const { done, value } = await reader.read()
    if (done) break
    const part = value.subarray(0, maxPageBytes - size)
    out.set(part, size)
    size += part.length
  }
  await reader.cancel().catch(() => {})
  return out.subarray(0, size)
}

const shorter = (b: Uint8Array): number => {
  const s = pictureSize(b)
  return s ? Math.min(s.width, s.height) : 0
}

// The logo from the station's homepage: tries the icons in iconCandidates'
// order and stops at the first that loads at 64px or more; else keeps the
// biggest that loaded. Throws with the reason when none did.
export async function fetchSiteLogo(site: string, o: SiteLogoOptions): Promise<Uint8Array> {
  const u = new URL(site)
  if (!isWeb(u)) throw new Error('not a web address')
  const ms = o.timeoutMs ?? timeoutMs
  // Chromium follows at most 20 redirects
  const res = await o.fetch(u.href, {
    headers: { 'User-Agent': o.userAgent, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(ms)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const type = res.headers.get('content-type') ?? ''
  if (type && !/html/i.test(type)) throw new Error(`not a web page (${type})`)
  const page = webUrl(res.url, site)?.href ?? u.href
  const html = new TextDecoder().decode(await readHead(res))

  let best: Uint8Array | undefined
  const reasons: string[] = []
  for (const url of iconCandidates(html, page).slice(0, maxIconTries)) {
    let pic: Uint8Array
    try {
      pic = await fetchLogo(url, { fetch: o.fetch, userAgent: o.userAgent, timeoutMs: ms })
    } catch (e) {
      reasons.push(`${url}: ${String(e)}`)
      continue
    }
    if (shorter(pic) >= smallLogoSide) return pic
    if (!best || shorter(pic) > shorter(best)) best = pic
  }
  if (best) return best
  throw new Error(`no icon on the page (${reasons.join('; ')})`)
}
