// A logo for a station that has none, from the icons on its homepage (ticket
// 033). The page is only read as text and scanned for <link> and <meta> tags;
// nothing in it runs. Each icon goes through fetchLogo, so the same type, size
// and pixel checks hold as for a logo address.
import { smallLogoSide, webAddress } from '../../shared/stations'
import { fetchLogo, pictureSize, refusedAddress } from './logo-fetch'

export interface SiteLogoOptions {
  // checkedFetch in the app (each redirect checked); a fake in tests
  fetch: typeof fetch
  userAgent: string
  // for the page, and for each icon
  timeoutMs?: number
  // local network addresses too: only for a station that is on one itself
  privateOk?: boolean
}

const timeoutMs = 10000
// Icons are in the <head>; a page past this is cut, not refused.
const maxPageBytes = 512 * 1024
// Icons downloaded per homepage at most, so a page with many icons costs a
// few requests, not dozens.
export const maxIconTries = 6

const webUrl = (href: string | undefined, base: string): URL | undefined =>
  href ? webAddress(href, base) : undefined

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

// <link>, <meta> and <base> tags outside comments, scripts and styles. One
// pass takes whichever starts first, so "<!--" in a script is script text.
function tags(html: string): Tag[] {
  const text = html.replace(
    /<!--[\s\S]*?(?:-->|$)|<(script|style|template)\b[\s\S]*?(?:<\/\1\s*>|$)/gi,
    ''
  )
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
  // the page says it is not square (a share banner)
  wide?: boolean
}

// The icons to try, in order: sized ones of 64px or more (biggest first),
// then the unsized ones (apple-touch-icon, og:image, icon), then the small
// sized ones, then an og:image the page says is not square, then
// /favicon.ico. Only the first maxIconTries are asked. Relative addresses are resolved against the
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
    hint?: number,
    wide?: boolean
  ): void => {
    const u = webUrl(href, base)
    if (u && !isSvg(u, type)) list.push({ url: u.href, hint, rank, wide })
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
  const sized = w > 0 && h > 0
  add(og, meta('og:image:type'), 1, sized ? Math.min(w, h) : undefined, sized && !square(w, h))

  const group = (c: Candidate): number =>
    c.wide ? 3 : c.hint === undefined ? 1 : c.hint >= smallLogoSide ? 0 : 2
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

// Near enough to square for the stage, which crops a cover to its middle
// square: a 1200x630 share banner would lose its sides.
function square(w: number, h: number): boolean {
  return Math.max(w, h) <= 1.25 * Math.min(w, h)
}

// Square first, then the bigger shorter side; a tie keeps the earlier one.
function better(a: Uint8Array, b: Uint8Array | undefined): boolean {
  if (!b) return true
  const sa = pictureSize(a)!
  const sb = pictureSize(b)!
  const qa = square(sa.width, sa.height)
  const qb = square(sb.width, sb.height)
  if (qa !== qb) return qa
  return Math.min(sa.width, sa.height) > Math.min(sb.width, sb.height)
}

// The logo from the station's homepage: downloads the first maxIconTries of
// iconCandidates and keeps the best (see better); a picture that is not
// square only when no square one loaded. Throws with the reason when none did.
export async function fetchSiteLogo(site: string, o: SiteLogoOptions): Promise<Uint8Array> {
  const refused = refusedAddress(site, o.privateOk)
  if (refused) throw new Error(refused)
  const u = new URL(site)
  const ms = o.timeoutMs ?? timeoutMs
  // the app's fetch follows at most 10 redirects (checked-fetch.ts)
  const res = await o.fetch(u.href, {
    headers: { 'User-Agent': o.userAgent, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(ms)
  })
  const type = res.headers.get('content-type') ?? ''
  const wrong = !res.ok
    ? `HTTP ${res.status}`
    : type && !/html/i.test(type) && `not a web page (${type})`
  if (wrong) {
    // else the request waits, paused, for its timeout
    await res.body?.cancel().catch(() => {})
    throw new Error(wrong)
  }
  // Response.url is where it ended up; checkedFetch sets it (net.fetch would not)
  const page = webUrl(res.url, site)?.href ?? u.href
  const landed = refusedAddress(page, o.privateOk)
  if (landed) {
    await res.body?.cancel().catch(() => {})
    throw new Error(landed)
  }
  const html = new TextDecoder().decode(await readHead(res))

  let best: Uint8Array | undefined
  const reasons: string[] = []
  // local ones are dropped first, so they can't use up the tries
  const urls = iconCandidates(html, page).filter((x) => !refusedAddress(x, o.privateOk))
  for (const url of urls.slice(0, maxIconTries)) {
    let pic: Uint8Array
    try {
      pic = await fetchLogo(url, {
        fetch: o.fetch,
        userAgent: o.userAgent,
        timeoutMs: ms,
        privateOk: o.privateOk
      })
    } catch (e) {
      reasons.push(`${url}: ${String(e)}`)
      continue
    }
    if (better(pic, best)) best = pic
  }
  if (best) return best
  throw new Error(`no icon on the page (${reasons.join('; ')})`)
}
