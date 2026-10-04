// The files plugin in main, on a fake library process: what turning it off
// stops (scans, folder and artist changes, audio, large covers), what goes on
// (the library for the page, the radio's song lookup), and turning it on again.
import { describe, expect, it, vi } from 'vitest'
import { LibraryChannel } from '../../../shared/plugins/files/ipc'
import type { CoverHelper, PluginContext } from '../types'
import type { WorkerIn, WorkerOut } from './types'
import type { AiClient } from '../../../shared/ai'

// the library processes made, with what main sent each
const children: { sent: WorkerIn[]; emit(m: WorkerOut): void }[] = []

// A process that answers every ask at once: a library with nothing in it, no song cover.
function answer(m: WorkerIn): WorkerOut | undefined {
  if (!('req' in m) || m.type === 'cancel') return undefined
  if (m.type === 'get-library') return { type: 'reply', req: m.req, data: new Uint8Array([1]) }
  if (m.type === 'song-cover') return { type: 'reply', req: m.req, song: 'none' }
  return { type: 'reply', req: m.req }
}

vi.mock('electron', () => ({
  app: { getPath: () => '/nowhere', getVersion: () => '0' },
  protocol: {},
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/new'] }) },
  utilityProcess: {
    fork: () => {
      const listeners = new Map<string, (m: unknown) => void>()
      const sent: WorkerIn[] = []
      children.push({ sent, emit: (m) => listeners.get('message')?.(m) })
      return {
        postMessage: (m: WorkerIn) => {
          sent.push(m)
          const out = answer(m)
          if (out) queueMicrotask(() => listeners.get('message')?.(out))
        },
        on(event: string, f: (m: unknown) => void) {
          listeners.set(event, f)
          return this
        }
      }
    }
  }
}))
vi.mock('./library-worker?modulePath', () => ({ default: 'library-worker.js' }))

const { FilesPlugin } = await import('./plugin')

type Handler = (...args: unknown[]) => unknown

// A fake AI service: the tasks on (ready), those switched on but not ready,
// and a way to say on() or enabled() changed.
function fakeAi(): {
  client: AiClient
  tasks: Set<string>
  notReady: Set<string>
  change(): void
  asked: { task: string; avoid?: string[] }[]
} {
  const asked: { task: string; avoid?: string[] }[] = []
  const tasks = new Set<string>()
  const notReady = new Set<string>()
  const listeners = new Set<() => void>()
  const client: AiClient = {
    on: (task) => tasks.has(task),
    enabled: (task) => tasks.has(task) || notReady.has(task),
    changed: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    maxInput: async () => undefined,
    ask: async (task, _req, _signal, avoid) => {
      asked.push({ task, avoid })
      return { ok: true, json: { matches: [] }, model: 'm' }
    }
  }
  return { client, tasks, notReady, change: () => listeners.forEach((f) => f()), asked }
}

function setup(
  on: boolean,
  ai = fakeAi()
): {
  plugin: InstanceType<typeof FilesPlugin>
  call(channel: string, ...args: unknown[]): Promise<unknown>
  media(id: string): Promise<Response>
  sent(): WorkerIn['type'][]
  folders: string[][]
  helper: CoverHelper
} {
  children.length = 0
  const handlers = new Map<string, Handler>()
  const routes = new Map<string, (req: Request, url: URL, parts: string[]) => unknown>()
  const folders: string[][] = []
  let helper: CoverHelper | undefined
  const settings = {
    folders: ['/music'],
    fetchCovers: true,
    coverSources: { musicbrainz: true, deezer: true, itunes: true },
    plugins: { files: on, radio: true, mfp: false }
  }
  const store = {
    readable: true,
    get: () => settings,
    live: () => settings,
    setFolders: (f: string[]) => {
      folders.push(f)
      settings.folders = f
    }
  }
  const ctx = {
    settings: store,
    userData: '/nowhere',
    toPage: () => {},
    idsMoved: () => true,
    page: {
      handle: (c: string, f: Handler) => handlers.set(c, f),
      on: (c: string, f: Handler) => handlers.set(c, f)
    },
    route: (host: string, f: never) => routes.set(host, f),
    covers: {
      get: () => ({ cache: { dir: '/nowhere/covers' } }),
      provide: (h: CoverHelper) => (helper = h)
    },
    ai: ai.client
  } as unknown as PluginContext
  const plugin = new FilesPlugin({ keptByOthers: () => [] })
  plugin.start(ctx)
  plugin.setOn(on)
  const child = (): (typeof children)[number] => children[children.length - 1]
  return {
    plugin,
    call: async (channel, ...args) => handlers.get(channel)!({}, ...args),
    media: async (id) => {
      const url = new URL(`spindle://media/${id}`)
      return (await routes.get('media')!(new Request(url), url, [id])) as Response
    },
    sent: () => child().sent.map((m) => m.type),
    folders,
    helper: helper!
  }
}

// the page's first load, and the scan that follows it
async function loadPage(s: ReturnType<typeof setup>): Promise<void> {
  await s.call(LibraryChannel.load)
  await new Promise((r) => setTimeout(r, 0))
}

describe('FilesPlugin', () => {
  it('scans after the page loads while on', async () => {
    const s = setup(true)
    expect(children[0].sent[0]).toMatchObject({ type: 'start', start: { on: true } })
    await loadPage(s)
    expect(s.sent()).toContain('scan')
  })

  it('starts its process off: the page gets the library, nothing is scanned or changed', async () => {
    const s = setup(false)
    expect(children[0].sent[0]).toMatchObject({ type: 'start', start: { on: false } })
    await loadPage(s)
    s.plugin.windowOpened()
    await s.call(LibraryChannel.rescan)
    await s.call(LibraryChannel.addFolder)
    expect(await s.call(LibraryChannel.addDropped, ['/music'])).toEqual({
      added: [],
      known: 0,
      other: 0
    })
    await s.call(LibraryChannel.removeFolder, '/music')
    await s.call(LibraryChannel.setArtists, { x: ['Y'] })
    expect(await s.call(LibraryChannel.showFolder, ['/music'])).toBe(false)
    expect(s.folders).toEqual([])
    expect(s.sent()).not.toContain('scan')
    expect(s.sent()).not.toContain('set-artists')
    expect(s.sent()).toContain('get-library')
  })

  it('answers 404 for audio and makes no large cover while off', async () => {
    const s = setup(false)
    expect((await s.media('abc')).status).toBe(404)
    expect(await s.helper.source('a'.repeat(40))).toBeUndefined()
    expect(s.sent()).not.toContain('find-track')
    expect(s.sent()).not.toContain('cover-source')
  })

  it('looks up radio song covers while off', async () => {
    const s = setup(false)
    expect(await s.helper.song({ artist: 'a', song: 's' }, new AbortController().signal)).toBe(
      'none'
    )
    expect(s.sent()).toContain('song-cover')
  })

  it('turned off, tells the process and asks no more scans; turned on, scans as at start', async () => {
    const s = setup(true)
    await loadPage(s)
    s.plugin.setOn(false)
    expect(children[0].sent.at(-1)).toEqual({ type: 'set-on', on: false })
    const scans = s.sent().filter((t) => t === 'scan').length
    await s.call(LibraryChannel.rescan)
    expect(s.sent().filter((t) => t === 'scan').length).toBe(scans)
    s.plugin.setOn(true)
    expect(children[0].sent.slice(-2).map((m) => m.type)).toEqual(['set-on', 'scan'])
    // the same process: no restart
    expect(children).toHaveLength(1)
  })

  it('turned on before the page loaded, waits for it to scan', async () => {
    const s = setup(false)
    s.plugin.setOn(true)
    expect(s.sent()).not.toContain('scan')
    await loadPage(s)
    expect(s.sent()).toContain('scan')
  })

  it('tells the process whether the artist groups task is on and enabled, at start and when it changes', () => {
    const ai = fakeAi()
    ai.tasks.add('artist-groups')
    setup(true, ai)
    expect(children[0].sent[0]).toMatchObject({
      type: 'start',
      start: { aiOn: { 'artist-groups': true }, aiEnabled: { 'artist-groups': true } }
    })
    // a change that leaves the task as it was sends nothing
    ai.change()
    expect(children[0].sent.filter((m) => m.type === 'ai-on')).toEqual([])
    // the provider is no longer ready (a refused key): still enabled
    ai.tasks.delete('artist-groups')
    ai.notReady.add('artist-groups')
    ai.change()
    expect(children[0].sent.at(-1)).toEqual({
      type: 'ai-on',
      tasks: { 'artist-groups': false },
      enabled: { 'artist-groups': true }
    })
    // switched off
    ai.notReady.delete('artist-groups')
    ai.change()
    expect(children[0].sent.at(-1)).toEqual({
      type: 'ai-on',
      tasks: { 'artist-groups': false },
      enabled: { 'artist-groups': false }
    })
  })
  it("makes the library process's AI requests with its AiClient and answers them", async () => {
    const ai = fakeAi()
    setup(true, ai)
    const req = { system: 's', user: 'u', schema: {}, maxOutput: 1 }
    children[0].emit({ type: 'ai-ask', id: 4, task: 'artist-groups', req, avoid: ['x'] })
    children[0].emit({ type: 'ai-ask', id: 5, task: 'other', req })
    await new Promise((r) => setTimeout(r, 0))
    expect(ai.asked).toEqual([{ task: 'artist-groups', avoid: ['x'] }])
    expect(children[0].sent.filter((m) => m.type === 'ai-reply')).toEqual([
      { type: 'ai-reply', id: 5, answer: { ok: false, error: 'off' } },
      { type: 'ai-reply', id: 4, answer: { ok: true, json: { matches: [] }, model: 'm' } }
    ])
  })
})
