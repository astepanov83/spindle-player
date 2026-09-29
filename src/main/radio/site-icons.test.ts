import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { fetchSiteLogo, iconCandidates, maxIconTries } from './site-icons'

// Radio Paradise's homepage as served (a base href, icons, scripts and comments)
const paradise = readFileSync(join(__dirname, 'fixtures', 'radioparadise-home.html'), 'utf8')
const home = 'https://radioparadise.com/'
const og = 'https://vsh-smedia.radioparadise.com/uploads/RP_Logo_Flat_HCR_Green_1_18a033c355.png'

const be32 = (n: number): number[] => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const ascii = (t: string): number[] => [...t].map((c) => c.charCodeAt(0))
// a PNG as far as its size, which is all fetchLogo reads
const png = (side: number): Uint8Array<ArrayBuffer> =>
  new Uint8Array([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...be32(13),
    ...ascii('IHDR'),
    ...be32(side),
    ...be32(side),
    8,
    2,
    0,
    0,
    0
  ])

type Answer = string | Uint8Array<ArrayBuffer> | number | (() => Response)

// Answers by address: a page, a picture, or an HTTP status. `at` is where a
// page ended up after redirects (Response.url).
interface Site {
  fetch: typeof fetch
  asked: string[]
  opts: { fetch: typeof fetch; userAgent: string }
}
function site(answers: Record<string, Answer>, at: Record<string, string> = {}): Site {
  const asked: string[] = []
  const fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    asked.push(url)
    const a = answers[url]
    let res: Response
    if (a === undefined) res = new Response('', { status: 404 })
    else if (typeof a === 'number') res = new Response('', { status: a })
    else if (typeof a === 'function') res = a()
    else if (typeof a === 'string')
      res = new Response(a, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    else res = new Response(a, { headers: { 'Content-Type': 'image/png' } })
    Object.defineProperty(res, 'url', { value: at[url] ?? url })
    return res
  }) as typeof globalThis.fetch
  return { fetch, asked, opts: { fetch, userAgent: 'Spindle/test' } }
}

describe('iconCandidates', () => {
  it('lists the page’s icons, biggest hint first, relative ones from the base href', () => {
    expect(iconCandidates(paradise, home)).toEqual([
      og,
      'https://radioparadise.com/apple-touch-icon.png',
      'https://radioparadise.com/favicon.ico',
      'https://radioparadise.com/favicon-32x32.png',
      'https://radioparadise.com/favicon-16x16.png'
    ])
  })

  it('resolves relative addresses against the page when there is no base', () => {
    const html = `<head><link rel="apple-touch-icon" href="img/touch.png">
      <link rel="shortcut icon" href="../fav.png"></head>`
    expect(iconCandidates(html, 'https://x.example/radio/index.html')).toEqual([
      'https://x.example/radio/img/touch.png',
      'https://x.example/fav.png',
      'https://x.example/favicon.ico'
    ])
  })

  it('takes a base href that points at another host', () => {
    const html = `<base href="https://cdn.example/s/"><link rel=icon sizes=192x192 href=i.png>`
    expect(iconCandidates(html, 'https://x.example/')).toEqual([
      'https://cdn.example/s/i.png',
      'https://x.example/favicon.ico'
    ])
  })

  it('reads sizes, og:image sizes and entities, and puts icons under 64px after unsized ones', () => {
    const html = `
      <link rel="icon" sizes="16x16 48x48" href="/small.png">
      <link rel="icon" href="/plain.png">
      <meta property="og:image" content="/share.jpg?w=1&amp;h=2">
      <meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
      <link rel="apple-touch-icon-precomposed" sizes="152x152" href="/touch.png">`
    expect(iconCandidates(html, 'https://x.example/')).toEqual([
      'https://x.example/share.jpg?w=1&h=2',
      'https://x.example/touch.png',
      'https://x.example/plain.png',
      'https://x.example/small.png',
      'https://x.example/favicon.ico'
    ])
  })

  it('skips SVG, data and other non-web addresses, and icons in scripts or comments', () => {
    const html = `
      <link rel="icon" type="image/svg+xml" href="/i.svg">
      <link rel="icon" href="/logo.svg?v=2">
      <link rel="icon" href="data:image/png;base64,AAAA">
      <link rel="icon" href="javascript:alert(1)">
      <!-- <link rel="apple-touch-icon" href="/old.png"> -->
      <script>document.write('<link rel="icon" href="/js.png">')</script>`
    expect(iconCandidates(html, 'https://x.example/')).toEqual(['https://x.example/favicon.ico'])
  })

  it('scans a hostile page of unclosed tags quickly (it runs in main)', () => {
    for (const bad of ['<link ', '<link "', "<meta a='"]) {
      const t = performance.now()
      iconCandidates(bad.repeat((512 * 1024) / bad.length), 'https://x.example/')
      expect(performance.now() - t).toBeLessThan(500)
    }
  })

  it('lists /favicon.ico once', () => {
    expect(iconCandidates('<link rel="icon" href="/favicon.ico">', 'https://x.example/a')).toEqual([
      'https://x.example/favicon.ico'
    ])
  })
})

describe('fetchSiteLogo', () => {
  it('stops at the first icon of 64px or more, biggest hint first', async () => {
    const pic = png(180)
    const s = site({
      [home]: paradise,
      [og]: 404,
      'https://radioparadise.com/apple-touch-icon.png': pic,
      'https://radioparadise.com/favicon.ico': png(32)
    })
    expect(await fetchSiteLogo(home, s.opts)).toEqual(pic)
    expect(s.asked).toEqual([home, og, 'https://radioparadise.com/apple-touch-icon.png'])
  })

  it('keeps the biggest one that loads when none is 64px', async () => {
    const big = png(48)
    const s = site({
      [home]: paradise,
      'https://radioparadise.com/favicon.ico': png(16),
      'https://radioparadise.com/favicon-32x32.png': big,
      'https://radioparadise.com/favicon-16x16.png': png(16)
    })
    expect(await fetchSiteLogo(home, s.opts)).toEqual(big)
    expect(s.asked).toHaveLength(6)
  })

  it('resolves icons against where the page ended up after redirects', async () => {
    const pic = png(120)
    const s = site(
      {
        'http://x.example/': '<link rel="apple-touch-icon" href="touch.png">',
        'https://www.x.example/radio/touch.png': pic
      },
      { 'http://x.example/': 'https://www.x.example/radio/' }
    )
    expect(await fetchSiteLogo('http://x.example/', s.opts)).toEqual(pic)
  })

  it('fails when the page has no icon that loads (the station keeps the tile)', async () => {
    const s = site({ 'https://x.example/': '<title>No icons</title>' })
    await expect(fetchSiteLogo('https://x.example/', s.opts)).rejects.toThrow(/no icon/)
    expect(s.asked).toEqual(['https://x.example/', 'https://x.example/favicon.ico'])
  })

  it('tries at most a few icons', async () => {
    const links = Array.from({ length: 10 }, (_, i) => `<link rel="icon" href="/i${i}.png">`)
    const s = site({ 'https://x.example/': links.join('') })
    await expect(fetchSiteLogo('https://x.example/', s.opts)).rejects.toThrow()
    expect(s.asked).toHaveLength(1 + maxIconTries)
  })

  it('reads at most 512 KB of the page', async () => {
    const filler = 'x'.repeat(600 * 1024)
    const late = `<head>${filler}<link rel="apple-touch-icon" href="/late.png"></head>`
    const s = site({ 'https://x.example/': late, 'https://x.example/late.png': png(180) })
    await expect(fetchSiteLogo('https://x.example/', s.opts)).rejects.toThrow()
    expect(s.asked).not.toContain('https://x.example/late.png')
  })

  it('stops reading a page that never ends', async () => {
    let pulls = 0
    const endless = (): Response =>
      new Response(
        new ReadableStream({
          pull(c) {
            pulls++
            c.enqueue(new TextEncoder().encode('<p>'.repeat(10000)))
          }
        }),
        { headers: { 'Content-Type': 'text/html' } }
      )
    const s = site({ 'https://x.example/': endless })
    await expect(fetchSiteLogo('https://x.example/', s.opts)).rejects.toThrow()
    expect(pulls).toBeLessThan(40)
  })

  it('refuses what is not a web page, such as the stream itself', async () => {
    const stream = (): Response =>
      new Response(new Uint8Array(100), { headers: { 'Content-Type': 'audio/mpeg' } })
    const s = site({ 'https://x.example/': stream })
    await expect(fetchSiteLogo('https://x.example/', s.opts)).rejects.toThrow(/not a web page/)
    expect(s.asked).toHaveLength(1)
  })

  it('fails on an HTTP error and on addresses that are not http(s)', async () => {
    const s = site({ 'https://x.example/': 500 })
    await expect(fetchSiteLogo('https://x.example/', s.opts)).rejects.toThrow(/HTTP 500/)
    await expect(fetchSiteLogo('ftp://x.example/', s.opts)).rejects.toThrow(/not a web address/)
    expect(s.asked).toHaveLength(1)
  })

  it('gives up on a page that takes too long', async () => {
    const fetch = ((_url: string, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })) as typeof globalThis.fetch
    await expect(
      fetchSiteLogo('https://x.example/', { fetch, userAgent: 'Spindle/test', timeoutMs: 30 })
    ).rejects.toThrow()
  })
})
