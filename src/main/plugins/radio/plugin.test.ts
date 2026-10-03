import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RadioChannel } from '../../../shared/plugins/radio/ipc'
import { fallbackPalettes } from '../../../shared/palette'
import { stationsFile, type Station } from '../../../shared/plugins/radio/stations'
import type { PluginContext } from '../types'

vi.mock('electron', () => ({ app: { getPath: () => '/nowhere' }, protocol: {}, net: {} }))

const { RadioPlugin } = await import('./plugin')

const station: Station = {
  id: 'rb-1',
  name: 'Drone',
  tags: [],
  streams: [{ url: 'https://drone.example/stream' }]
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-radio-plugin-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

type Handler = (...args: unknown[]) => unknown

// The plugin on fake page, network and cover cache; `fetched` lists every request it makes.
function setup(opts: { hasLogo?: boolean; bundled?: () => Promise<Uint8Array> } = {}): {
  plugin: InstanceType<typeof RadioPlugin>
  call(channel: string, ...args: unknown[]): Promise<unknown>
  route(host: string, path: string): Promise<Response>
  fetched: string[]
  lookups: string[]
  aborted: () => boolean
  bundled: ReturnType<typeof vi.fn>
  addLogo: ReturnType<typeof vi.fn>
  sources: { fetchCovers: boolean; coverSources: Record<string, boolean> }
} {
  const handlers = new Map<string, Handler>()
  const routes = new Map<string, (req: Request, url: URL, parts: string[]) => unknown>()
  const fetched: string[] = []
  const lookups: string[] = []
  let signal: AbortSignal | undefined
  const bundled = vi.fn(opts.bundled ?? (async () => new Uint8Array([1])))
  const addLogo = vi.fn(async () => undefined)
  const sources = { fetchCovers: false, coverSources: {} as Record<string, boolean> }
  const plugin = new RadioPlugin(dir, { log: () => {}, bundledLogo: bundled })
  const cache = {
    addLogo,
    hasLogo: async () => opts.hasLogo ?? false,
    logoPalette: async () => undefined
  }
  const ctx = {
    settings: { live: () => sources },
    userData: dir,
    userAgent: 'test',
    log: () => {},
    toPage: () => {},
    page: {
      handle: (c: string, f: Handler) => handlers.set(c, f),
      on: (c: string, f: Handler) => handlers.set(c, f)
    },
    route: (host: string, f: never) => routes.set(host, f),
    fetch: (async (url: string, init?: RequestInit) => {
      fetched.push(String(url))
      signal = init?.signal ?? undefined
      return new Response(new ReadableStream(), { headers: { 'content-type': 'audio/mpeg' } })
    }) as unknown as typeof fetch,
    request: () => {
      throw new Error('no logo requests in this test')
    },
    dns: {
      lookup: async (host: string) => {
        lookups.push(host)
        throw new Error('no network')
      },
      reverse: async () => []
    },
    covers: {
      get: () => ({ cache, song: async () => 'later' as const, kept: () => {} }),
      kept: () => {}
    }
  } as unknown as PluginContext
  plugin.start(ctx)
  return {
    plugin,
    call: async (channel, ...args) => handlers.get(channel)!({}, ...args),
    route: async (host, path) => {
      const url = new URL(`spindle://${host}/${path}`)
      const parts = url.pathname.split('/').filter(Boolean)
      return (await routes.get(host)!(new Request(url), url, parts)) as Response
    },
    fetched,
    lookups,
    aborted: () => signal?.aborted ?? false,
    bundled,
    addLogo,
    sources
  }
}

const ids = (list: unknown): string[] => (list as Station[]).map((s) => s.id)

describe('RadioPlugin on', () => {
  it('saves a station and searches', async () => {
    const r = setup()
    r.plugin.setOn(true)
    expect(ids(await r.call(RadioChannel.save, station))).toContain('rb-1')
    await r.call(RadioChannel.search, 'drone')
    expect(r.lookups).toHaveLength(1)
  })

  it('opens a station stream', async () => {
    const r = setup()
    r.plugin.setOn(true)
    await r.call(RadioChannel.save, station)
    const res = await r.route('radio', 'rb-1?stream=0')
    expect(res.status).toBe(200)
    expect(r.fetched).toEqual(['https://drone.example/stream'])
  })

  it('makes the logo that ships with the app only when turned on', async () => {
    const r = setup()
    expect(r.bundled).not.toHaveBeenCalled()
    r.plugin.setOn(true)
    await vi.waitFor(() => expect(r.bundled).toHaveBeenCalled())
  })
})

describe('RadioPlugin off', () => {
  it('does not search or fetch, and answers off', async () => {
    const r = setup()
    r.plugin.setOn(false)
    expect(await r.call(RadioChannel.search, 'drone')).toEqual({ ok: false })
    expect(r.lookups).toEqual([])
    expect(r.fetched).toEqual([])
  })

  it('does not look a station up on play', async () => {
    const r = setup()
    expect(await r.call(RadioChannel.play, station)).toBeUndefined()
    expect(r.fetched).toEqual([])
  })

  it('refuses changes to My stations and leaves the file alone', async () => {
    const r = setup()
    r.plugin.setOn(true)
    await r.call(RadioChannel.save, station)
    r.plugin.flushSync()
    const file = join(dir, 'stations.json')
    const before = readFileSync(file, 'utf8')
    r.plugin.setOn(false)
    expect(ids(await r.call(RadioChannel.save, { ...station, id: 'rb-2' }))).toEqual([
      'metal-only',
      'rb-1'
    ])
    expect(ids(await r.call(RadioChannel.remove, 'rb-1'))).toContain('rb-1')
    expect(ids(await r.call(RadioChannel.restore, 'rb-1'))).toContain('rb-1')
    expect(ids(await r.call(RadioChannel.move, 'rb-1', -1))).toEqual(['metal-only', 'rb-1'])
    expect(ids(await r.call(RadioChannel.choose, 'rb-1', 'https://drone.example/stream'))).toEqual([
      'metal-only',
      'rb-1'
    ])
    r.plugin.flushSync()
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('still lists the stations', async () => {
    const r = setup()
    expect(ids(await r.call(RadioChannel.stations))).toEqual(['metal-only'])
  })

  it('answers 404 for spindle://radio and spindle://radio-logo', async () => {
    const r = setup()
    r.plugin.setOn(true)
    await r.call(RadioChannel.save, station)
    r.plugin.setOn(false)
    expect((await r.route('radio', 'rb-1?stream=0')).status).toBe(404)
    expect((await r.route('radio-logo', 'rb-1')).status).toBe(404)
    expect(r.fetched).toEqual([])
  })

  it('stops the stream playing when turned off', async () => {
    const r = setup()
    r.plugin.setOn(true)
    await r.call(RadioChannel.save, station)
    await r.route('radio', 'rb-1?stream=0')
    expect(r.aborted()).toBe(false)
    r.plugin.setOn(false)
    expect(r.aborted()).toBe(true)
  })

  it('still lets radio:stop through', async () => {
    const r = setup()
    r.plugin.setOn(true)
    await r.call(RadioChannel.save, station)
    await r.route('radio', 'rb-1?stream=0')
    r.plugin.setOn(false)
    await expect(r.call(RadioChannel.stop)).resolves.toBeUndefined()
  })

  it('keeps its covers listed, so the prune does not drop them', async () => {
    const hash = 'a'.repeat(40)
    const logo = { hash, palette: fallbackPalettes('x'), from: 'https://drone.example/logo.png' }
    writeFileSync(
      join(dir, 'stations.json'),
      JSON.stringify(stationsFile([{ ...station, logoUrl: logo.from, logo }]))
    )
    const r = setup({ hasLogo: true })
    r.plugin.setOn(true)
    expect(r.plugin.keptCovers()).toContain(hash)
    r.plugin.setOn(false)
    expect(r.plugin.keptCovers()).toContain(hash)
  })

  it('makes no picture from a logo that arrives after it went off', async () => {
    let arrive!: (b: Uint8Array) => void
    const r = setup({ bundled: () => new Promise((ok) => (arrive = ok)) })
    r.plugin.setOn(true)
    await vi.waitFor(() => expect(r.bundled).toHaveBeenCalled())
    r.plugin.setOn(false)
    arrive(new Uint8Array([1]))
    await new Promise((ok) => setTimeout(ok, 20))
    expect(r.addLogo).not.toHaveBeenCalled()
  })

  it('makes a logo refused while off once it is on again', async () => {
    let arrive!: (b: Uint8Array) => void
    const r = setup({ bundled: () => new Promise((ok) => (arrive = ok)) })
    r.plugin.setOn(true)
    await vi.waitFor(() => expect(r.bundled).toHaveBeenCalledOnce())
    r.plugin.setOn(false)
    arrive(new Uint8Array([1]))
    await new Promise((ok) => setTimeout(ok, 20))
    r.bundled.mockImplementation(async () => new Uint8Array([1]))
    r.plugin.setOn(true)
    await vi.waitFor(() => expect(r.addLogo).toHaveBeenCalled())
    expect(r.bundled).toHaveBeenCalledTimes(2)
  })

  it('does not look at the cover setting while off, and sees it when turned on', async () => {
    const miss = { version: 1, songs: { 'iron maiden\0the trooper': { at: Date.now() } } }
    writeFileSync(join(dir, 'radio-covers.json'), JSON.stringify(miss))
    const r = setup()
    r.sources.fetchCovers = true
    r.plugin.setOn(true)
    r.plugin.setOn(false)
    // a service turned on while off
    r.sources.coverSources = { deezer: true }
    r.plugin.coverSettingChanged()
    r.plugin.flushSync()
    expect(readFileSync(join(dir, 'radio-covers.json'), 'utf8')).toContain('trooper')
    r.plugin.setOn(true)
    r.plugin.flushSync()
    expect(readFileSync(join(dir, 'radio-covers.json'), 'utf8')).not.toContain('trooper')
  })
})
