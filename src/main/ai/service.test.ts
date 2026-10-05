// The AI service with the fake provider and a made-up task, end to end.
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Answer, AiTaskInfo, JsonRequest } from '../../shared/ai'
import { defaultAiSettings, type AiSettings } from '../../shared/settings'
import { FakeProvider } from './providers/fake/provider'
import { FileSecrets, type SafeStorage } from './secrets'
import { createAiService, type AiEnv, type AiService } from './service'
import type { ModelInfo, Provider, ProviderContext } from './types'

const task: AiTaskInfo = {
  id: 'name-things',
  name: 'Name things',
  about: 'Gives things names.',
  sends: 'Sends the things.'
}
const req: JsonRequest = { system: 'Be brief.', user: 'Name it.', schema: {}, maxOutput: 100 }
const key = 'sk-very-secret'

const storage = (available = true): SafeStorage => ({
  isEncryptionAvailable: () => available,
  encryptString: (t) => Buffer.from(t).reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString()
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-ai-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

// A provider with nothing to set up, ready from the start.
function plainProvider(id: string): Provider & {
  start: Mock<Provider['start']>
  act: Mock<Provider['act']>
  stop: Mock<Provider['stop']>
} {
  return {
    info: { id, name: id.toUpperCase(), about: '' },
    start: vi.fn(),
    ready: () => true,
    blocks: () => [{ kind: 'status', text: `${id} here` }],
    act: vi.fn(async () => {}),
    models: async () => [],
    ask: async () => ({ ok: false, error: 'failed' }),
    stop: vi.fn()
  }
}

interface Setup {
  ai: AiService
  // what settings.json would hold of ai
  settingsFile(): string
  lines: string[]
  signal: AbortSignal
}

function setup(
  o: { providers?: Provider[]; safe?: boolean; saved?: Partial<AiSettings> } = {}
): Setup {
  let saved: AiSettings = { ...defaultAiSettings(), ...o.saved }
  const settingsFile = (): string => JSON.stringify(saved)
  const lines: string[] = []
  const secrets = new FileSecrets(join(dir, 'ai-secrets.json'), storage(o.safe ?? true))
  const env: AiEnv = {
    providers: o.providers ?? [new FakeProvider()],
    tasks: [task],
    settings: { get: () => saved, set: (ai) => (saved = structuredClone(ai)) },
    secrets,
    fetch: vi.fn(),
    openExternal: vi.fn(),
    callbackServer: vi.fn(),
    log: (t) => lines.push(t)
  }
  const ai = createAiService(env)
  const signal = new AbortController().signal
  return { ai, settingsFile, lines, signal }
}

describe('AiService with the fake provider', () => {
  it('is off until the task is on and the key is saved, then asks', async () => {
    const { ai, signal } = setup()
    expect(ai.client.on(task.id)).toBe(false)
    expect(await ai.client.ask(task.id, req, signal)).toEqual({ ok: false, error: 'off' })
    expect(await ai.client.maxInput(task.id, 100, signal)).toBeUndefined()

    ai.setTask(task.id, true)
    expect(ai.client.on(task.id)).toBe(false)
    await ai.act('fake', 'key', 'set', key)
    expect(ai.client.on(task.id)).toBe(true)
    // the schema model first, though the provider lists it second
    expect(await ai.client.ask(task.id, req, signal)).toEqual({
      ok: true,
      json: {},
      model: 'fake-schema'
    })
    expect(await ai.client.maxInput(task.id, 100, signal)).toBe(7900)

    ai.setTask(task.id, false)
    expect(await ai.client.ask(task.id, req, signal)).toEqual({ ok: false, error: 'off' })
  })

  it('says enabled by the switch alone, ready or not', async () => {
    const { ai } = setup()
    let heard = 0
    ai.client.changed(() => heard++)
    expect(ai.client.enabled(task.id)).toBe(false)
    ai.setTask(task.id, true)
    expect(heard).toBe(1)
    // no key yet: enabled, not on
    expect(ai.client.enabled(task.id)).toBe(true)
    expect(ai.client.on(task.id)).toBe(false)
    await ai.act('fake', 'key', 'set', key)
    expect(ai.client.on(task.id)).toBe(true)
    // the key gone (a refused key, Disconnect): still enabled
    await ai.act('fake', 'key', 'remove')
    expect(ai.client.on(task.id)).toBe(false)
    expect(ai.client.enabled(task.id)).toBe(true)
    ai.setTask(task.id, false)
    expect(ai.client.enabled(task.id)).toBe(false)
    expect(ai.client.enabled('no-such-task')).toBe(false)
  })

  it('keeps the key in the secrets file only: never in the state, the settings or the log', async () => {
    const { ai, settingsFile, lines, signal } = setup()
    ai.setTask(task.id, true)
    await ai.act('fake', 'key', 'set', key)
    await ai.client.ask(task.id, req, signal)
    const state = ai.state()
    expect(state.blocks).toEqual([
      { kind: 'text', id: 'key', label: 'Test key', secret: true, saved: true }
    ])
    expect(JSON.stringify(state)).not.toContain(key)
    expect(settingsFile()).not.toContain(key)
    expect(lines.join('\n')).not.toContain(key)
    expect(lines.join('\n')).not.toContain(req.user)
    expect(readFileSync(join(dir, 'ai-secrets.json'), 'utf8')).not.toContain(key)
    // read again at the next start
    expect(setup().ai.client.on(task.id)).toBe(false)
    const next = setup({ saved: { tasks: { [task.id]: true } } })
    expect(next.ai.client.on(task.id)).toBe(true)

    await ai.act('fake', 'key', 'remove')
    expect(ai.client.on(task.id)).toBe(false)
    expect(ai.state().blocks[0]).toMatchObject({ kind: 'text', saved: false })
  })

  it('logs each request without the prompt', async () => {
    const { ai, lines, signal } = setup({ saved: { tasks: { [task.id]: true } } })
    await ai.act('fake', 'key', 'set', key)
    await ai.client.ask(task.id, req, signal)
    expect(lines).toEqual([
      expect.stringMatching(/^AI name-things: fake-schema, 6 tokens in, \d+ ms: ok$/)
    ])
  })

  it('logs the tokens and cost the provider gives, on an answer and on a failure', async () => {
    const p = plainProvider('paid')
    const m: ModelInfo = { id: 'p/m', name: 'M', context: 10000, maxOutput: 1000, json: 'schema' }
    p.models = async () => [m, { ...m, id: 'p/n' }]
    const answers: Answer[] = [
      { ok: false, error: 'failed', usage: { tokensIn: 900, tokensOut: 40 } },
      { ok: true, json: {}, model: 'p/n', usage: { tokensIn: 1200, tokensOut: 80, cost: 0.00213 } }
    ]
    p.ask = async () => answers.shift()!
    const { ai, lines, signal } = setup({
      providers: [p],
      saved: { tasks: { [task.id]: true } }
    })
    await ai.client.ask(task.id, req, signal)
    expect(lines).toEqual([
      expect.stringMatching(/: p\/m, 6 tokens in, \d+ ms: failed, used 900 tokens in and 40 out$/),
      expect.stringMatching(
        /: p\/n, 6 tokens in, \d+ ms: ok, used 1200 tokens in and 80 out, \$0\.0021$/
      )
    ])
  })

  it('gives the state of each task and the provider list', async () => {
    const { ai } = setup()
    expect(ai.state()).toEqual({
      providers: [{ id: 'fake', name: 'Test service' }],
      // the saved 'openrouter' is not in this list: the first one is used
      provider: 'fake',
      tasks: { [task.id]: { info: task, on: false, ready: false } },
      blocks: [{ kind: 'text', id: 'key', label: 'Test key', secret: true, saved: false }]
    })
    ai.setTask(task.id, true)
    expect(ai.state().tasks[task.id]).toMatchObject({ on: true, ready: false })
  })

  it('says when keys only last until quit', () => {
    const { ai } = setup({ safe: false })
    expect(ai.state().blocks[0]).toMatchObject({ kind: 'status', error: true })
    expect(ai.state().blocks[0]).toHaveProperty('text', expect.stringContaining("Can't store keys"))
  })

  it('tells listeners when the state changes', async () => {
    const { ai } = setup()
    const heard = vi.fn()
    const stop = ai.onState(heard)
    const client = vi.fn()
    ai.client.changed(client)
    ai.setTask(task.id, true)
    // the same value again is no change
    ai.setTask(task.id, true)
    await ai.act('fake', 'key', 'set', key)
    expect(heard.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(client.mock.calls.length).toBe(heard.mock.calls.length)
    stop()
    heard.mockClear()
    ai.setTask(task.id, false)
    expect(heard).not.toHaveBeenCalled()
  })

  it('ignores an unknown task and acts for a provider that is not chosen', async () => {
    const other = plainProvider('other')
    const { ai, settingsFile } = setup({ providers: [new FakeProvider(), other] })
    ai.setTask('nope', true)
    expect(settingsFile()).not.toContain('nope')
    expect(ai.client.on('nope')).toBe(false)
    await ai.act('other', 'x', 'press')
    expect(other.act).not.toHaveBeenCalled()
  })
})

describe('switching the provider', () => {
  it('stops the old one, starts the new one once, and saves the choice', async () => {
    const a = plainProvider('a')
    const b = plainProvider('b')
    const { ai, settingsFile } = setup({ providers: [a, b], saved: { tasks: { [task.id]: true } } })
    const heard = vi.fn()
    ai.onState(heard)
    expect(ai.state()).toMatchObject({ provider: 'a', blocks: [{ text: 'a here' }] })
    expect(a.start).toHaveBeenCalledOnce()
    expect(b.start).not.toHaveBeenCalled()

    ai.setProvider('b')
    expect(a.stop).toHaveBeenCalledOnce()
    expect(b.start).toHaveBeenCalledOnce()
    expect(heard).toHaveBeenCalledOnce()
    expect(JSON.parse(settingsFile()).provider).toBe('b')
    expect(ai.state()).toMatchObject({ provider: 'b', blocks: [{ text: 'b here' }] })
    await ai.act('b', 'x', 'press')
    expect(b.act).toHaveBeenCalledWith('x', 'press', undefined)

    ai.setProvider('a')
    expect(a.start).toHaveBeenCalledOnce()
    // unknown, or the chosen one already
    ai.setProvider('zzz')
    ai.setProvider('a')
    // b, the act, a
    expect(heard).toHaveBeenCalledTimes(3)
  })

  it("keeps each provider's plain settings under its id", () => {
    let ctx: ProviderContext | undefined
    const a = { ...plainProvider('a'), start: (c: ProviderContext) => (ctx = c) }
    const { ai, settingsFile } = setup({ providers: [a] })
    // started once it is first used
    ai.state()
    ctx!.settings.set('model', 'm1')
    expect(ctx!.settings.get('model')).toBe('m1')
    expect(JSON.parse(settingsFile()).providers).toEqual({ a: { model: 'm1' } })
  })

  it('with no provider at all, every task is off', async () => {
    const { ai, signal } = setup({ providers: [], saved: { tasks: { [task.id]: true } } })
    expect(ai.client.on(task.id)).toBe(false)
    expect(await ai.client.ask(task.id, req, signal)).toEqual({ ok: false, error: 'off' })
    expect(ai.state()).toMatchObject({ providers: [], provider: 'openrouter', blocks: [] })
  })
})

describe('ask', () => {
  const ready = (answer: (m: ModelInfo) => Answer): FakeProvider => {
    const p = new FakeProvider(answer)
    p.ready = () => true
    return p
  }
  const on = { tasks: { [task.id]: true } }

  it('is too-big when no model takes the request', async () => {
    const { ai, signal } = setup({
      providers: [ready(() => ({ ok: false, error: 'failed' }))],
      saved: on
    })
    const big = { ...req, user: 'x'.repeat(30000) }
    expect(await ai.client.ask(task.id, big, signal)).toEqual({ ok: false, error: 'too-big' })
  })

  it('goes to the next model after a failure, and skips avoided ones', async () => {
    const asked: string[] = []
    const answer = (m: ModelInfo): Answer => {
      asked.push(m.id)
      return m.id === 'fake-schema'
        ? { ok: false, error: 'failed' }
        : { ok: true, json: 2, model: m.id }
    }
    const { ai, signal } = setup({ providers: [ready(answer)], saved: on })
    expect(await ai.client.ask(task.id, req, signal)).toMatchObject({
      ok: true,
      model: 'fake-prompt'
    })
    expect(asked).toEqual(['fake-schema', 'fake-prompt'])
    asked.length = 0
    expect(await ai.client.ask(task.id, req, signal, ['fake-prompt'])).toMatchObject({
      ok: false,
      error: 'failed'
    })
    expect(asked).toEqual(['fake-schema'])
  })

  it('says avoided, and asks nothing, when every model that fits is avoided', async () => {
    const asked: string[] = []
    const answer = (m: ModelInfo): Answer => {
      asked.push(m.id)
      return { ok: false, error: 'failed' }
    }
    const { ai, signal } = setup({ providers: [ready(answer)], saved: on })
    const a = await ai.client.ask(task.id, req, signal, ['fake-schema', 'fake-prompt'])
    expect(a).toMatchObject({ ok: false, error: 'failed', avoided: true })
    expect(asked).toEqual([])
    // a model that was asked and failed is not avoided
    const b = await ai.client.ask(task.id, req, signal, ['fake-prompt'])
    expect(b).toEqual({ ok: false, error: 'failed' })
    expect(asked).toEqual(['fake-schema'])
  })

  it.each([
    ['the provider is switched', (ai: AiService) => ai.setProvider('b')],
    ['the task is turned off', (ai: AiService) => ai.setTask(task.id, false)]
  ])('sends nothing more once %s mid-ask', async (_, change) => {
    const asked: string[] = []
    // made after the provider, which needs it
    const late: { ai?: AiService } = {}
    const answer = (m: ModelInfo): Answer => {
      asked.push(m.id)
      change(late.ai!)
      // what a stopped provider's aborted request comes back as
      return { ok: false, error: 'failed' }
    }
    const s = setup({ providers: [ready(answer), plainProvider('b')], saved: on })
    late.ai = s.ai
    expect(await s.ai.client.ask(task.id, req, s.signal)).toEqual({ ok: false, error: 'off' })
    expect(asked).toEqual(['fake-schema'])
  })

  it('still says auth when the refused key makes the provider not ready', async () => {
    const p = ready(() => {
      p.ready = () => false
      return { ok: false, error: 'auth' }
    })
    const { ai, signal } = setup({ providers: [p], saved: on })
    expect(await ai.client.ask(task.id, req, signal)).toEqual({ ok: false, error: 'auth' })
  })

  it('counts a provider that throws as failed for that model', async () => {
    const { ai, signal } = setup({
      providers: [
        ready((m) => {
          if (m.id === 'fake-schema') throw new Error('boom')
          return { ok: true, json: 3, model: m.id }
        })
      ],
      saved: on
    })
    expect(await ai.client.ask(task.id, req, signal)).toMatchObject({ ok: true, json: 3 })
  })
})
