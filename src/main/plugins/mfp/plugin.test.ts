import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MfpChannel } from '../../../shared/ipc'
import type { MfpEpisodes } from '../../../shared/plugins/mfp/mfp'
import { defaultPalettes } from '../../../shared/palette'
import type { PluginContext } from '../types'
import { episodeId, songId } from './episodes'
import { serializeMfp, staleMs } from './store'

vi.mock('electron', () => ({ app: { getPath: () => '/nowhere' }, protocol: {}, net: {} }))

const { MfpPlugin, mfpSite } = await import('./plugin')

const hash = 'c'.repeat(40)
const mp3 = 'https://datashat.net/one.mp3'
const now = 100 * staleMs

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-mfp-plugin-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function writeFile(fetchedAt: number): void {
  const episode = {
    slug: 'one',
    number: 1,
    title: '1: Mixer',
    artist: 'Mixer',
    url: mp3,
    bytes: 1000,
    duration: 600,
    date: '2020-05-01T00:00:00Z',
    tracks: [
      { artist: 'A', title: 'First' },
      { artist: 'B', title: 'Second' }
    ],
    link: `${mfpSite}/one`
  }
  const data = { fetchedAt, cover: { hash, palette: defaultPalettes, v: 1 }, episodes: [episode] }
  writeFileSync(join(dir, 'mfp.json'), JSON.stringify(serializeMfp(data)))
}

type Handler = (...args: unknown[]) => unknown

// The plugin on a fake page, network and cover cache; `fetched` lists every request.
function setup(o: { hasLogo?: boolean; site?: (url: string) => Response } = {}): {
  plugin: InstanceType<typeof MfpPlugin>
  call(channel: string, ...args: unknown[]): Promise<unknown>
  route(path: string, init?: RequestInit): Promise<Response>
  fetched: { url: string; range?: string }[]
  sent: [string, unknown][]
  kept: () => number
} {
  const handlers = new Map<string, Handler>()
  let route: ((req: Request, url: URL, parts: string[]) => unknown) | undefined
  const fetched: { url: string; range?: string }[] = []
  const sent: [string, unknown][] = []
  let kept = 0
  const plugin = new MfpPlugin(dir, { log: () => {}, now: () => now })
  const cache = {
    addLogo: async () => ({ palette: defaultPalettes, side: 600 }),
    hasLogo: async () => o.hasLogo ?? true,
    logoPalette: async () => undefined
  }
  const ctx = {
    userAgent: 'test',
    toPage: (c: string, d: unknown) => sent.push([c, d]),
    page: {
      handle: (c: string, f: Handler) => handlers.set(c, f),
      on: (c: string, f: Handler) => handlers.set(c, f)
    },
    route: (host: string, f: never) => {
      if (host === 'mfp') route = f
    },
    fetch: (async (url: string, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('Range') ?? undefined
      fetched.push(range ? { url: String(url), range } : { url: String(url) })
      if (o.site && !String(url).endsWith('.mp3')) return o.site(String(url))
      return new Response('abc', {
        status: range ? 206 : 200,
        headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '3' }
      })
    }) as unknown as typeof fetch,
    covers: {
      get: () => ({ cache, song: async () => 'later' as const, kept: () => {} }),
      kept: () => kept++
    }
  } as unknown as PluginContext
  plugin.start(ctx)
  return {
    plugin,
    call: async (channel, ...args) => handlers.get(channel)!({}, ...args),
    route: async (path, init) => {
      const url = new URL(`spindle://mfp/${path}`)
      const parts = url.pathname.split('/').filter(Boolean)
      return (await route!(new Request(url, init), url, parts)) as Response
    },
    fetched,
    sent,
    kept: () => kept
  }
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('MfpPlugin off', () => {
  it('gives the page the episodes of mfp.json with their ids, and no status', async () => {
    writeFile(1)
    const m = setup()
    m.plugin.setOn(false)
    const data = (await m.call(MfpChannel.get)) as MfpEpisodes & { status?: unknown }
    expect(data.episodes.map((e) => e.id)).toEqual([episodeId('one')])
    expect(data.episodes[0].songs.map((s) => s.id)).toEqual([songId('one', 0), songId('one', 1)])
    expect(data.cover).toEqual({ hash, palette: defaultPalettes })
    expect(data.status).toBeUndefined()
  })

  it('makes no request and changes no file, and refuses the audio', async () => {
    writeFile(1)
    const before = readFileSync(join(dir, 'mfp.json'), 'utf8')
    const m = setup({ hasLogo: false })
    m.plugin.setOn(false)
    await m.call(MfpChannel.refresh)
    await settle()
    expect((await m.route(episodeId('one'))).status).toBe(404)
    expect(m.fetched).toEqual([])
    m.plugin.flushSync()
    expect(readFileSync(join(dir, 'mfp.json'), 'utf8')).toBe(before)
  })

  it('removes the temp files of a write cut off last run, on or off', () => {
    writeFile(1)
    writeFileSync(join(dir, 'mfp.json.123.4.tmp'), '{')
    writeFileSync(join(dir, 'other.json.123.5.tmp'), '{')
    const m = setup()
    m.plugin.setOn(false)
    expect(readdirSync(dir).sort()).toEqual(['mfp.json', 'other.json.123.5.tmp'])
  })

  it('keeps its picture from the cover prune, on or off', () => {
    writeFile(1)
    const m = setup()
    expect(m.plugin.keptCovers()).toEqual([hash])
    m.plugin.setOn(true)
    m.plugin.setOn(false)
    expect(m.plugin.keptCovers()).toEqual([hash])
  })
})

describe('MfpPlugin on', () => {
  it('serves an episode by its id with the page Range passed on', async () => {
    writeFile(now)
    const m = setup()
    m.plugin.setOn(true)
    const res = await m.route(episodeId('one'), { headers: { Range: 'bytes=100-' } })
    expect(res.status).toBe(206)
    expect(await res.text()).toBe('abc')
    expect(m.fetched).toEqual([{ url: mp3, range: 'bytes=100-' }])
  })

  it('serves only its episodes, and never decodes', async () => {
    writeFile(now)
    const m = setup()
    m.plugin.setOn(true)
    expect((await m.route('nothing')).status).toBe(404)
    expect((await m.route(encodeURIComponent(mp3))).status).toBe(404)
    expect((await m.route(`${episodeId('one')}?decode`)).status).toBe(415)
    expect(m.fetched).toEqual([])
  })

  it('reads a stale file again, and sends the status and new episodes', async () => {
    writeFile(1)
    const m = setup({
      site: (url) => {
        if (url !== `${mfpSite}/latest`) return new Response('', { status: 404 })
        return new Response('<a href=one>1: Mixer</a><a href=two>2: Other</a>')
      }
    })
    m.plugin.setOn(true)
    await settle()
    await settle()
    expect(m.fetched.map((f) => f.url)).toEqual([`${mfpSite}/latest`, `${mfpSite}/two`])
    const status = m.sent.filter(([c]) => c === MfpChannel.status).map(([, s]) => s)
    expect(status.at(-1)).toEqual({ episodes: 1, fetchedAt: now, running: false })
    const episodes = m.sent.filter(([c]) => c === MfpChannel.episodes)
    expect(episodes).toHaveLength(1)
    expect((await m.call(MfpChannel.get)) as object).toMatchObject({ status: status.at(-1) })
    m.plugin.flushSync()
    expect(JSON.parse(readFileSync(join(dir, 'mfp.json'), 'utf8')).fetchedAt).toBe(now)
  })

  it('gets the picture into the cover cache and keeps it', async () => {
    writeFile(now)
    const m = setup({ hasLogo: false, site: () => new Response(new Uint8Array([1, 2])) })
    m.plugin.setOn(true)
    await settle()
    await settle()
    expect(m.fetched.map((f) => f.url)).toEqual([`${mfpSite}/img/folder.jpg`])
    const data = (await m.call(MfpChannel.get)) as MfpEpisodes
    expect(data.cover?.hash).not.toBe(hash)
    // the old picture is no longer used, so the prune may take it
    expect(m.plugin.keptCovers()).toEqual([data.cover?.hash])
    expect(m.kept()).toBeGreaterThan(0)
  })

  it('reads the site when the page asks, while on', async () => {
    writeFile(now)
    const m = setup({ site: () => new Response('') })
    m.plugin.setOn(true)
    await settle()
    expect(m.fetched).toEqual([])
    await m.call(MfpChannel.refresh)
    await settle()
    expect(m.fetched.map((f) => f.url)).toEqual([`${mfpSite}/latest`])
  })
})
