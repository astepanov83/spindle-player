import { createHash } from 'crypto'
import { describe, expect, it, vi } from 'vitest'
import type { Answer, JsonRequest } from '../../../../shared/ai'
import type { SettingBlock } from '../../../../shared/setting-blocks'
import type { CallbackServer, ModelInfo, ProviderContext } from '../../types'
import models from './fixtures/models.json'
import { OpenRouterProvider } from './provider'

const noSignal = new AbortController().signal
const req: JsonRequest = { system: 'sys', user: 'usr', schema: { type: 'object' }, maxOutput: 500 }

interface Call {
  url: string
  init: RequestInit
}

type Setup = ReturnType<typeof setup>

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(opts: { key?: string; model?: string } = {}) {
  const secrets = new Map<string, string>()
  const settings = new Map<string, string>()
  if (opts.model) settings.set('model', opts.model)
  const calls: Call[] = []
  const replies: ((call: Call) => Response | Promise<Response>)[] = []
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} }
    calls.push(call)
    const next = replies.shift()
    if (!next) throw new Error('no reply planned')
    return next(call)
  })
  let now = 1_000_000
  const sleeps: number[] = []
  const clock = {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      now += ms
    }
  }
  const logs: string[] = []
  const changed = vi.fn()
  const opened: string[] = []
  const ctx: ProviderContext = {
    secrets: {
      get: (n) => secrets.get(n),
      set: (n, v) => void secrets.set(n, v),
      remove: (n) => void secrets.delete(n)
    },
    settings: { get: (n) => settings.get(n), set: (n, v) => void settings.set(n, v) },
    fetch: fetch as unknown as typeof globalThis.fetch,
    openExternal: (u) => void opened.push(u),
    callbackServer: async () => {
      throw new Error('not planned')
    },
    log: (t) => void logs.push(t),
    changed
  }
  const provider = new OpenRouterProvider(clock)
  // the key comes after start, so no list is asked for on its own
  provider.start(ctx)
  if (opts.key) secrets.set('key', opts.key)
  return {
    provider,
    ctx,
    secrets,
    settings,
    calls,
    replies,
    sleeps,
    logs,
    changed,
    opened,
    advance: (ms: number) => void (now += ms)
  }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers })

const credits = (total: number, used: number): unknown => ({
  data: { total_credits: total, total_usage: used }
})

const answerBody = (content: string): unknown => ({ choices: [{ message: { content } }] })

const model = (over: Partial<ModelInfo> = {}): ModelInfo => ({
  id: 'm/x:free',
  name: 'X',
  context: 100000,
  maxOutput: 5000,
  json: 'schema',
  ...over
})

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function fakeServer() {
  let answer!: (q: URLSearchParams) => void
  let fail!: (e: Error) => void
  const code = new Promise<URLSearchParams>((res, rej) => {
    answer = res
    fail = rej
  })
  code.catch(() => {})
  const server: CallbackServer & { closed: number } = {
    url: 'http://127.0.0.1:5555/callback',
    code,
    closed: 0,
    close() {
      server.closed++
      fail(new Error('Closed'))
    }
  }
  return { server, answer, fail }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('login', () => {
  it('opens the auth address with the challenge of the verifier, swaps the code for a key', async () => {
    const t = setup()
    const cb = fakeServer()
    t.ctx.callbackServer = async () => cb.server
    t.replies.push(() => json({ key: 'sk-secret' }))
    expect(t.provider.ready()).toBe(false)
    const done = t.provider.act('connect', 'press')
    await tick()
    expect(t.provider.blocks()).toEqual([
      { kind: 'status', text: 'Waiting for the browser…', busy: true },
      { kind: 'button', id: 'cancel', label: 'Cancel' }
    ])
    const url = new URL(t.opened[0])
    expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth')
    expect(url.searchParams.get('callback_url')).toBe(cb.server.url)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('key_label')).toBe('Spindle')
    cb.answer(new URLSearchParams({ code: 'the-code' }))
    await done

    const body = JSON.parse(String(t.calls[0].init.body))
    expect(t.calls[0].url).toBe('https://openrouter.ai/api/v1/auth/keys')
    expect(body.code).toBe('the-code')
    expect(body.code_challenge_method).toBe('S256')
    const challenge = createHash('sha256').update(body.code_verifier).digest('base64url')
    expect(url.searchParams.get('code_challenge')).toBe(challenge)
    expect(t.secrets.get('key')).toBe('sk-secret')
    expect(t.provider.ready()).toBe(true)
    expect(cb.server.closed).toBeGreaterThan(0)
    expect(t.provider.blocks()[0]).toEqual({ kind: 'status', text: 'Connected' })
  })

  const fails = async (
    reply: (t: Setup, cb: ReturnType<typeof fakeServer>) => void
  ): Promise<{ t: Setup; cb: ReturnType<typeof fakeServer> }> => {
    const t = setup()
    const cb = fakeServer()
    t.ctx.callbackServer = async () => cb.server
    const done = t.provider.act('connect', 'press')
    await tick()
    reply(t, cb)
    await done
    return { t, cb }
  }
  const errorLine = (t: Setup): string => {
    const b = t.provider.blocks()
    expect(b[0]).toMatchObject({ kind: 'button', id: 'connect' })
    return (b.find((x) => x.kind === 'status' && x.error) as { text: string }).text
  }

  it('says so when the browser comes back with no code', async () => {
    const { t } = await fails((_t, cb) => cb.answer(new URLSearchParams({ error: 'denied' })))
    expect(errorLine(t)).toContain('no code')
    expect(t.secrets.has('key')).toBe(false)
  })

  it('says so when the exchange fails, without the code or verifier in the text', async () => {
    const { t } = await fails((t, cb) => {
      t.replies.push(() => json({ error: { message: 'bad code-1234' } }, 400))
      cb.answer(new URLSearchParams({ code: 'code-1234' }))
    })
    const text = errorLine(t)
    expect(text).toContain('HTTP 400')
    expect(text).not.toContain('code-1234')
    expect(t.logs.join()).not.toContain('code-1234')
    expect(t.secrets.has('key')).toBe(false)
  })

  it('says so when the login runs out of time', async () => {
    const { t } = await fails((_t, cb) => cb.fail(new Error('No answer from the login in time')))
    expect(errorLine(t)).toContain('in time')
  })

  it('closes the waiting server on Cancel and shows Connect again, with no error', async () => {
    const t = setup()
    const cb = fakeServer()
    t.ctx.callbackServer = async () => cb.server
    const done = t.provider.act('connect', 'press')
    await tick()
    await t.provider.act('cancel', 'press')
    await done
    expect(cb.server.closed).toBeGreaterThan(0)
    expect(t.provider.blocks().some((b) => b.kind === 'status' && b.error)).toBe(false)
    expect(t.provider.blocks()[0]).toMatchObject({ id: 'connect' })
    expect(t.secrets.has('key')).toBe(false)
  })

  it('does not save a key when Cancel comes during the exchange', async () => {
    const t = setup()
    const cb = fakeServer()
    t.ctx.callbackServer = async () => cb.server
    let seen: AbortSignal | undefined
    t.replies.push((call) => {
      seen = call.init.signal ?? undefined
      return new Promise((resolve, reject) => {
        seen?.addEventListener('abort', () => reject(new Error('aborted')))
        // would answer later, as if the key came back anyway
        setTimeout(() => resolve(json({ key: 'sk-late' })), 20)
      })
    })
    const done = t.provider.act('connect', 'press')
    await tick()
    cb.answer(new URLSearchParams({ code: 'c' }))
    await tick()
    await t.provider.act('cancel', 'press')
    await done
    expect(seen?.aborted).toBe(true)
    expect(t.secrets.has('key')).toBe(false)
    expect(t.provider.blocks().some((b) => b.kind === 'status' && b.error)).toBe(false)
  })

  it('does not open the browser when Cancel comes before the server is up', async () => {
    const t = setup()
    const cb = fakeServer()
    let up!: () => void
    t.ctx.callbackServer = () => new Promise((resolve) => (up = () => resolve(cb.server)))
    const done = t.provider.act('connect', 'press')
    await tick()
    await t.provider.act('cancel', 'press')
    up()
    await done
    expect(t.opened).toEqual([])
    expect(cb.server.closed).toBeGreaterThan(0)
    expect(t.calls).toEqual([])
    expect(t.provider.blocks()[0]).toMatchObject({ id: 'connect' })
  })

  it('closes the server when stopped while waiting', async () => {
    const t = setup()
    const cb = fakeServer()
    t.ctx.callbackServer = async () => cb.server
    const done = t.provider.act('connect', 'press')
    await tick()
    t.provider.stop()
    await done
    expect(cb.server.closed).toBeGreaterThan(0)
  })

  it('removes the key on Disconnect and says where to delete it', async () => {
    const t = setup({ key: 'sk-1' })
    await t.provider.act('disconnect', 'press')
    expect(t.secrets.has('key')).toBe(false)
    const text = t.provider
      .blocks()
      .map((b) => ('text' in b ? b.text : ''))
      .join('|')
    expect(text).toContain('openrouter.ai, Settings, Keys')
  })

  // a new account must not get the paid models on the old account's credit
  const paidNow = async (t: Setup): Promise<boolean> =>
    (await t.provider.models(noSignal)).some((m) => !m.id.endsWith(':free'))
  const withCredit = async (): Promise<Setup> => {
    const t = setup({ key: 'k' })
    t.replies.push(() => json(models))
    t.replies.push(() => json(credits(10, 0.09)))
    expect(await paidNow(t)).toBe(true)
    return t
  }

  it('reads the credit again after Disconnect and a new key', async () => {
    const t = await withCredit()
    await t.provider.act('disconnect', 'press')
    t.secrets.set('key', 'k2')
    t.replies.push(() => json(models))
    t.replies.push(() => json(credits(0, 0)))
    expect(await paidNow(t)).toBe(false)
    expect(t.calls.at(-1)!.url).toBe('https://openrouter.ai/api/v1/credits')
  })

  it('reads the credit again after a login', async () => {
    const t = await withCredit()
    const cb = fakeServer()
    t.ctx.callbackServer = async () => cb.server
    t.replies.push(() => json({ key: 'sk-other' }))
    t.replies.push(() => json(models))
    t.replies.push(() => json(credits(0, 0)))
    const done = t.provider.act('connect', 'press')
    await tick()
    cb.answer(new URLSearchParams({ code: 'the-code' }))
    await done
    await tick()
    expect(await paidNow(t)).toBe(false)
    const auth = (t.calls.at(-1)!.init.headers as Record<string, string>).Authorization
    expect(auth).toBe('Bearer sk-other')
  })
})

describe('models', () => {
  const list = async (t: Setup): Promise<ModelInfo[]> => {
    t.replies.push(() => json(models))
    return t.provider.models(noSignal)
  }

  it('keeps :free models and the two paid ones, largest free context first', async () => {
    const t = setup({ key: 'k' })
    t.replies.push(() => json(models))
    t.replies.push(() => json(credits(10, 0.09)))
    const all = await t.provider.models(noSignal)
    expect(t.calls[0].url).toBe('https://openrouter.ai/api/v1/models')
    expect(all.map((m) => m.id).slice(0, 2)).toEqual([
      'google/gemini-3.8-flash',
      'anthropic/claude-sonnet-5.5'
    ])
    const free = all.slice(2)
    expect(free.every((m) => m.id.endsWith(':free'))).toBe(true)
    expect(free).toHaveLength(7)
    const sizes = free.map((m) => m.context)
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
    expect(free[0].id).toBe('thinkingmachines/inkling-small:free')
  })

  it('reads the credit with the list and gives the paid models only with credit', async () => {
    const t = setup({ key: 'k' })
    t.replies.push(() => json(models))
    t.replies.push(() => json(credits(10, 0.09)))
    expect(await t.provider.models(noSignal)).toHaveLength(9)
    expect(t.calls[1].url).toBe('https://openrouter.ai/api/v1/credits')
    expect((t.calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer k')

    for (const reply of [() => json(credits(5, 5)), () => json({}, 500)]) {
      const t2 = setup({ key: 'k' })
      t2.replies.push(() => json(models))
      t2.replies.push(reply)
      const all = await t2.provider.models(noSignal)
      expect(all).toHaveLength(7)
      expect(all.every((m) => m.id.endsWith(':free'))).toBe(true)
    }
    // a failing fetch is no credit, too
    const t3 = setup({ key: 'k' })
    t3.replies.push(() => json(models))
    t3.replies.push(() => {
      throw new Error('down')
    })
    expect(await t3.provider.models(noSignal)).toHaveLength(7)
  })

  it('says schema when response_format or structured_outputs is supported', async () => {
    const all = await list(setup())
    const kind = (id: string): string | undefined => all.find((m) => m.id === id)?.json
    expect(kind('apodex/apodex-1.1-mini:free')).toBe('schema')
    expect(kind('qwen/qwen3.8-27b:free')).toBe('schema')
    expect(kind('google/gemma-4-31b-it:free')).toBe('schema')
    expect(kind('thinkingmachines/inkling-small:free')).toBe('prompt')
  })

  it('takes limits from top_provider, else the context and a quarter of it', async () => {
    const all = await list(setup())
    const by = (id: string): ModelInfo => all.find((m) => m.id === id)!
    expect(by('liquid/lfm-2.5-2.6b:free')).toMatchObject({ context: 65536, maxOutput: 8192 })
    // top_provider with nulls
    expect(by('nvidia/nemotron-3-super-120b-a12b:free')).toMatchObject({
      context: 131072,
      maxOutput: 32768
    })
    // no top_provider at all
    expect(by('poolside/laguna-s-2.1:free')).toMatchObject({ context: 262144, maxOutput: 65536 })
  })

  it('asks the list once an hour', async () => {
    const t = setup()
    await list(t)
    await t.provider.models(noSignal)
    expect(t.calls).toHaveLength(1)
    t.advance(61 * 60 * 1000)
    await list(t)
    expect(t.calls).toHaveLength(2)
  })

  it('returns only the fixed model', async () => {
    const t = setup({ model: 'qwen/qwen3.8-27b:free' })
    const all = await list(t)
    expect(all.map((m) => m.id)).toEqual(['qwen/qwen3.8-27b:free'])
  })

  it('goes back to the best model when the fixed one is gone', async () => {
    const t = setup({ model: 'gone/model:free' })
    const all = await list(t)
    // no key, so no credit
    expect(all).toHaveLength(7)
  })

  it('gives the model choice in the blocks, and sets it', async () => {
    const t = setup({ key: 'k', model: 'qwen/qwen3.8-27b:free' })
    await list(t)
    const choice = (): SettingBlock | undefined =>
      t.provider.blocks().find((b) => b.kind === 'choice')
    expect(choice()).toMatchObject({ value: 'qwen/qwen3.8-27b:free' })
    const options = (choice() as { options: { id: string }[] }).options
    expect(options[0]).toEqual({ id: 'auto', label: 'Best model' })
    // the paid ones are listed, marked
    expect(options).toHaveLength(10)
    expect(options.slice(1, 3)).toMatchObject([
      { id: 'google/gemini-3.8-flash', label: 'Google: Gemini 3.8 Flash (paid)' },
      { id: 'anthropic/claude-sonnet-5.5', label: 'Anthropic: Claude Sonnet 5.5 (paid)' }
    ])
    await t.provider.act('model', 'set', 'auto')
    expect(t.settings.get('model')).toBe('auto')
    expect(choice()).toMatchObject({ value: 'auto' })
  })

  it('shows an error and keeps the last list when the list fails', async () => {
    const t = setup({ key: 'k' })
    await list(t)
    t.advance(2 * 60 * 60 * 1000)
    t.replies.push(() => json({}, 500))
    await expect(t.provider.models(noSignal)).rejects.toThrow('HTTP 500')
    const blocks = t.provider.blocks()
    expect(blocks.some((b) => b.kind === 'status' && b.error)).toBe(true)
    expect(
      (blocks.find((b) => b.kind === 'choice') as { options: unknown[] }).options
    ).toHaveLength(10)
  })
})

describe('ask', () => {
  const paid = (): ModelInfo => model({ id: 'google/gemini-3.8-flash' })
  const ask = (t: Setup, m = model(), signal = noSignal): Promise<Answer> =>
    t.provider.ask(m, req, signal)

  it('sends the schema as response_format to a schema model', async () => {
    const t = setup({ key: 'sk-1' })
    t.replies.push(() => json(answerBody('{"a":1}')))
    const answer = await ask(t)
    expect(answer).toEqual({ ok: true, json: { a: 1 }, model: 'm/x:free' })
    const { url, init } = t.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sk-1',
      'HTTP-Referer': expect.any(String),
      'X-Title': 'Spindle'
    })
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'm/x:free',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'usr' }
      ],
      temperature: 0,
      max_tokens: 500,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'answer', strict: true, schema: { type: 'object' } }
      }
    })
  })

  it('puts the schema in the system text for a prompt model', async () => {
    const t = setup({ key: 'sk-1' })
    t.replies.push(() => json(answerBody('```json\n{"a":1}\n```')))
    const answer = await ask(t, model({ json: 'prompt' }))
    expect(answer).toMatchObject({ ok: true, json: { a: 1 } })
    const body = JSON.parse(String(t.calls[0].init.body))
    expect(body.response_format).toBeUndefined()
    expect(body.messages[0].content).toContain('sys')
    expect(body.messages[0].content).toContain('{"type":"object"}')
  })

  it('maps 401 to auth and forgets the key', async () => {
    const t = setup({ key: 'sk-1' })
    t.replies.push(() => json({ error: { message: 'no' } }, 401))
    expect(await ask(t)).toMatchObject({ ok: false, error: 'auth' })
    expect(t.secrets.has('key')).toBe(false)
    expect(t.provider.blocks()[0]).toMatchObject({ id: 'connect' })
  })

  it('maps 403 (a moderation flag or guardrail) to failed and keeps the key', async () => {
    const t = setup({ key: 'sk-1' })
    t.replies.push(() => json({ error: { code: 403, message: 'flagged' } }, 403))
    expect(await ask(t)).toMatchObject({ ok: false, error: 'failed', detail: 'HTTP 403: flagged' })
    t.replies.push(() => json({}, 403))
    expect(await ask(t)).toMatchObject({ ok: false, error: 'failed', detail: 'HTTP 403' })
    expect(t.secrets.has('key')).toBe(true)
    expect(t.provider.ready()).toBe(true)
  })

  it('reads the reset time of the free daily limit from the body', async () => {
    const t = setup({ key: 'k' })
    const daily = {
      error: {
        message: 'Rate limit exceeded: free-models-per-day',
        code: 429,
        metadata: { headers: { 'X-RateLimit-Reset': '1777420800000' } }
      }
    }
    t.replies.push(() => json(daily, 429))
    expect(await ask(t)).toMatchObject({ ok: false, error: 'limit', retryAt: 1777420800000 })
    // the real headers come first
    t.replies.push(() => json(daily, 429, { 'X-RateLimit-Reset': '1900000000000' }))
    expect(await ask(t)).toMatchObject({ ok: false, error: 'limit', retryAt: 1900000000000 })
    const t2 = setup({ key: 'k' })
    const after = { error: { code: 429, metadata: { headers: { 'Retry-After': '60' } } } }
    t2.replies.push(() => json(after, 429))
    expect(await ask(t2)).toMatchObject({ ok: false, error: 'limit', retryAt: 1_000_000 + 60_000 })
  })

  // seen on the user's machine: one model's provider was busy, the account was fine
  it('maps a 429 from a busy model provider to failed, so the next model is tried', async () => {
    const t = setup({ key: 'k' })
    const busy = {
      error: {
        message: 'Provider returned error',
        code: 429,
        metadata: {
          raw: 'qwen/qwen3.8-27b:free is temporarily rate-limited upstream. Please retry shortly',
          provider_name: 'ModelRun',
          is_byok: false,
          limit_source: 'upstream_provider_shared_pool'
        }
      }
    }
    t.replies.push(() => json(busy, 429))
    expect(await ask(t)).toMatchObject({ ok: false, error: 'failed' })
    expect(t.secrets.get('key')).toBe('k')
  })

  it('maps 429 to limit with retryAt from Retry-After or X-RateLimit-Reset', async () => {
    const t = setup({ key: 'k' })
    t.replies.push(() => json({}, 429, { 'Retry-After': '30' }))
    expect(await ask(t)).toMatchObject({ ok: false, error: 'limit', retryAt: 1_000_000 + 30_000 })
    t.replies.push(() => json({}, 429, { 'X-RateLimit-Reset': '1900000000000' }))
    expect(await ask(t)).toMatchObject({ ok: false, error: 'limit', retryAt: 1900000000000 })
    t.replies.push(() => json({}, 429))
    const none = await ask(t)
    expect(none).toMatchObject({ ok: false, error: 'limit' })
    expect(none.ok === false && none.retryAt).toBeUndefined()
  })

  it('maps 404, no endpoints, response_format errors, 5xx and a non-JSON reply to failed', async () => {
    const cases: Response[] = [
      json({ error: { message: 'nothing here' } }, 404),
      json({ error: { message: 'No endpoints found for x' } }, 400),
      json({ error: { message: 'response_format is not supported' } }, 400),
      json({}, 500),
      json({}, 503),
      json(answerBody('sorry, I cannot')),
      json({ choices: [] }),
      json({ error: { code: 502, message: 'upstream' } }, 200)
    ]
    for (const reply of cases) {
      const t = setup({ key: 'k' })
      t.replies.push(() => reply)
      expect(await ask(t)).toMatchObject({ ok: false, error: 'failed' })
      expect(t.secrets.get('key')).toBe('k')
    }
  })

  it('maps a throwing fetch to network', async () => {
    const t = setup({ key: 'sk-1' })
    t.replies.push(() => {
      throw new Error('ECONNRESET')
    })
    expect(await ask(t)).toMatchObject({ ok: false, error: 'network', detail: 'ECONNRESET' })
  })

  // a slow free model is that model's problem: the service tries the next one
  it('maps a request with no answer in 120 s to failed', async () => {
    vi.useFakeTimers()
    try {
      const t = setup({ key: 'k' })
      t.replies.push(
        (call) =>
          new Promise((_, reject) => {
            call.init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          })
      )
      const pending = ask(t)
      await vi.advanceTimersByTimeAsync(299_000)
      let settled = false
      void pending.then(() => (settled = true))
      await vi.advanceTimersByTimeAsync(0)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(await pending).toMatchObject({
        ok: false,
        error: 'failed',
        detail: 'no answer in 300 s'
      })
    } finally {
      vi.useRealTimers()
    }
  })

  // a paid model that ran out of credit: next model, and the credit is read again
  it('maps a 402 to failed and reads the credit again', async () => {
    const t = setup({ key: 'k' })
    t.replies.push(() => json(models))
    t.replies.push(() => json(credits(10, 0.09)))
    await t.provider.models(noSignal)
    t.replies.push(() => json({ error: { code: 402, message: 'Insufficient credits' } }, 402))
    t.replies.push(() => json(credits(2, 2)))
    const n = t.calls.length
    expect(await ask(t, paid())).toMatchObject({ ok: false, error: 'failed' })
    expect(t.calls[n].url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(t.calls[n + 1].url).toBe('https://openrouter.ai/api/v1/credits')
    const ids = (await t.provider.models(noSignal)).map((m) => m.id)
    expect(ids.some((id) => !id.endsWith(':free'))).toBe(false)
  })

  it('reads the credit again on a 402 inside a 200 reply', async () => {
    const t = setup({ key: 'k' })
    t.replies.push(() => json(models))
    t.replies.push(() => json(credits(10, 0.09)))
    await t.provider.models(noSignal)
    t.replies.push(() => json({ error: { code: 402, message: 'Insufficient credits' } }))
    t.replies.push(() => json(credits(2, 2)))
    const n = t.calls.length
    expect(await ask(t, paid())).toMatchObject({ ok: false, error: 'failed' })
    expect(t.calls[n + 1].url).toBe('https://openrouter.ai/api/v1/credits')
    const ids = (await t.provider.models(noSignal)).map((m) => m.id)
    expect(ids.some((id) => !id.endsWith(':free'))).toBe(false)
  })

  it('gives the tokens and cost OpenRouter says the ask used', async () => {
    const t = setup({ key: 'k' })
    const usage = { prompt_tokens: 1200, completion_tokens: 80, cost: 0.0021 }
    t.replies.push(() => json({ ...(answerBody('{"a":1}') as object), usage }))
    t.replies.push(() => json({ ...(answerBody('not json') as object), usage }))
    t.replies.push(() => json({ ...(answerBody('{}') as object), usage: { prompt_tokens: 5 } }))
    const used = { tokensIn: 1200, tokensOut: 80, cost: 0.0021 }
    expect(await ask(t, paid())).toEqual({
      ok: true,
      json: { a: 1 },
      model: 'google/gemini-3.8-flash',
      usage: used
    })
    // a reply that is not JSON is paid for too
    expect(await ask(t, paid())).toMatchObject({ ok: false, error: 'failed', usage: used })
    expect(await ask(t, paid())).not.toHaveProperty('usage')
  })

  it('rethrows the abort of the caller', async () => {
    const t = setup({ key: 'k' })
    const ctl = new AbortController()
    t.replies.push(
      (call) =>
        new Promise((_, reject) => {
          call.init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )
    const pending = ask(t, model(), ctl.signal)
    await tick()
    ctl.abort()
    await expect(pending).rejects.toBeDefined()
  })

  it('answers off when stop() aborts it', async () => {
    const t = setup({ key: 'k' })
    t.replies.push(
      (call) =>
        new Promise((_, reject) => {
          call.init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )
    const pending = ask(t)
    await tick()
    t.provider.stop()
    expect(await pending).toMatchObject({ ok: false, error: 'off' })
  })

  it('keeps 3.5 s between requests', async () => {
    const t = setup({ key: 'k' })
    for (let i = 0; i < 3; i++) t.replies.push(() => json(answerBody('{}')))
    await ask(t)
    await ask(t)
    t.advance(1000)
    await ask(t)
    expect(t.sleeps).toEqual([3500, 2500])
  })

  it('does not slow paid models', async () => {
    const t = setup({ key: 'k' })
    for (let i = 0; i < 3; i++) t.replies.push(() => json(answerBody('{}')))
    await ask(t, paid())
    await ask(t, paid())
    await ask(t, paid())
    expect(t.sleeps).toEqual([])
  })

  it('does not wait when enough time has passed', async () => {
    const t = setup({ key: 'k' })
    for (let i = 0; i < 2; i++) t.replies.push(() => json(answerBody('{}')))
    await ask(t)
    t.advance(4000)
    await ask(t)
    expect(t.sleeps).toEqual([])
  })

  it('never logs or returns the key', async () => {
    const t = setup({ key: 'sk-very-secret' })
    t.replies.push(() => json({ error: { message: 'bad' } }, 500))
    t.replies.push(() => {
      throw new Error('boom')
    })
    const a = await ask(t)
    const b = await ask(t)
    expect(JSON.stringify([a, b, t.logs, t.provider.blocks()])).not.toContain('sk-very-secret')
  })

  it('shows the privacy status after 3 asks in a row with no endpoints, as the service asks', async () => {
    const t = setup({ key: 'k' })
    t.replies.push(() => json(models))
    const all = await t.provider.models(noSignal)
    const hasStatus = (): boolean =>
      t.provider
        .blocks()
        .some((b) => b.kind === 'status' && b.error && b.text.includes('privacy settings'))
    const none = (): void =>
      void t.replies.push(() => json({ error: { message: 'No endpoints' } }, 404))
    // each request tries the same top 3 models, never more
    for (let n = 0; n < 3; n++) {
      expect(hasStatus()).toBe(false)
      none()
      await ask(t, all[n])
    }
    expect(hasStatus()).toBe(true)
    // one good answer clears it
    t.replies.push(() => json(answerBody('{}')))
    await ask(t, all[0])
    expect(hasStatus()).toBe(false)
    // another failure in between starts the count again
    none()
    none()
    t.replies.push(() => json({}, 500))
    none()
    for (const m of all.slice(0, 4)) await ask(t, m)
    expect(hasStatus()).toBe(false)
  })
})
