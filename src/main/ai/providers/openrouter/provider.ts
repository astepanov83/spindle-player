// OpenRouter's free models and two paid ones, with a one-click login (ticket 067). Everything
// about OpenRouter is in this folder.
import { createHash, randomBytes } from 'crypto'
import type { Answer, JsonRequest } from '../../../../shared/ai'
import type { SettingBlock } from '../../../../shared/setting-blocks'
import type { ModelInfo, Provider, ProviderContext } from '../../types'
import { api, askTimeoutMs, NetworkError, send, site } from './api'
import { answerFor, appName, chatUrl, requestBody } from './ask'
import { isFree, parseModels } from './models'

const hour = 60 * 60 * 1000
// free models allow 20 requests a minute
const spacingMs = 3500
const auto = 'auto'

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const done = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }
    const onAbort = (): void => {
      done()
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      done()
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })

export interface Clock {
  now(): number
  sleep(ms: number, signal: AbortSignal): Promise<void>
}

const realClock: Clock = { now: Date.now, sleep }

interface Login {
  cancelled: boolean
  close?: () => void
  abort?: () => void
}

export class OpenRouterProvider implements Provider {
  readonly info = {
    id: 'openrouter',
    name: 'OpenRouter',
    about:
      'Free models on openrouter.ai, and two paid models while your account has credit, a few cents per run. Log in with one click, no card needed.'
  }
  #ctx: ProviderContext | undefined
  #running = new Set<AbortController>()
  #nextAt = 0

  // login
  #login: Login | undefined
  // a line under the Connect button: what went wrong, or where to delete the key
  #note: { text: string; error: boolean } | undefined

  // models
  #list: ModelInfo[] = []
  #listAt = 0
  #listError: string | undefined
  // the account has credit, so the paid models are tried first
  #credit = false
  // asks in a row that said "no endpoints". The service tries 3 models at most
  // per request, so the whole list is never seen.
  #noEndpoints = 0

  constructor(private readonly clock: Clock = realClock) {}

  start(ctx: ProviderContext): void {
    this.#ctx = ctx
    if (this.ready()) void this.#refresh()
  }

  ready(): boolean {
    return !!this.#ctx?.secrets.get('key')
  }

  blocks(): SettingBlock[] {
    if (this.#login)
      return [
        { kind: 'status', text: 'Waiting for the browser…', busy: true },
        { kind: 'button', id: 'cancel', label: 'Cancel' }
      ]
    if (!this.ready()) {
      const out: SettingBlock[] = [
        { kind: 'button', id: 'connect', label: 'Connect OpenRouter' },
        { kind: 'status', text: 'Opens openrouter.ai to log in. Free, no card needed.' }
      ]
      if (this.#note)
        out.push({ kind: 'status', text: this.#note.text, error: this.#note.error || undefined })
      return out
    }
    const out: SettingBlock[] = [{ kind: 'status', text: 'Connected' }]
    if (this.#listError)
      out.push({
        kind: 'status',
        text: `Could not load the model list: ${this.#listError}`,
        error: true
      })
    if (this.#privacyBlocked())
      out.push({
        kind: 'status',
        text: 'Your OpenRouter privacy settings block the free models. Allow free providers at openrouter.ai, Settings, Privacy.',
        error: true
      })
    const fixed = this.#ctx?.settings.get('model')
    out.push({
      kind: 'choice',
      id: 'model',
      label: 'Model',
      value: fixed && this.#list.some((m) => m.id === fixed) ? fixed : auto,
      options: [
        { id: auto, label: 'Best model' },
        ...this.#list.map((m) => ({
          id: m.id,
          label: isFree(m.id) ? m.name : `${m.name} (paid)`,
          note: `${Math.round(m.context / 1000)}k context`
        }))
      ]
    })
    out.push({ kind: 'button', id: 'disconnect', label: 'Disconnect' })
    return out
  }

  async act(id: string, actionId: string, value?: string): Promise<void> {
    const ctx = this.#ctx
    if (!ctx) return
    if (id === 'connect' && actionId === 'press') await this.#connect(ctx)
    else if (id === 'cancel' && actionId === 'press') {
      this.#cancelLogin()
    } else if (id === 'disconnect' && actionId === 'press') {
      ctx.secrets.remove('key')
      this.#note = {
        text: 'Disconnected. The key stays in your OpenRouter account: delete it at openrouter.ai, Settings, Keys.',
        error: false
      }
      this.#noEndpoints = 0
      ctx.changed()
    } else if (id === 'model' && actionId === 'set' && value !== undefined) {
      ctx.settings.set('model', value)
      ctx.changed()
    }
  }

  async models(signal: AbortSignal): Promise<ModelInfo[]> {
    const list = await this.#load(signal)
    const fixed = this.#ctx?.settings.get('model')
    // a fixed choice that is gone from the list is "Best free model" again
    const one = fixed && fixed !== auto ? list.find((m) => m.id === fixed) : undefined
    // paid models wait for credit; a fixed one is asked anyway
    return one ? [one] : list.filter((m) => this.#credit || isFree(m.id))
  }

  async ask(model: ModelInfo, req: JsonRequest, signal: AbortSignal): Promise<Answer> {
    const ctx = this.#ctx
    const key = ctx?.secrets.get('key')
    if (!ctx || !key) return { ok: false, error: 'auth', detail: 'not connected' }
    const ctl = this.#link(signal)
    try {
      // take the next free place now, so asks at the same time queue up.
      // Only free models have the limit.
      if (isFree(model.id)) {
        const wait = Math.max(0, this.#nextAt - this.clock.now())
        this.#nextAt = this.clock.now() + wait + spacingMs
        if (wait) await this.clock.sleep(wait, ctl.signal)
      }
      const res = await send(
        ctx.fetch,
        chatUrl,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': site,
            'X-Title': appName
          },
          body: JSON.stringify(requestBody(model, req))
        },
        ctl.signal,
        askTimeoutMs
      )
      const { answer, noEndpoints } = answerFor(
        model,
        res.status,
        res.headers,
        res.text,
        this.clock.now(),
        () => {
          ctx.secrets.remove('key')
          this.#note = { text: 'OpenRouter refused the key. Connect again.', error: true }
          ctx.changed()
        }
      )
      this.#trackPrivacy(ctx, answer, noEndpoints)
      // the credit may have run out: the next ask must not start with a paid model
      if (res.status === 402) await this.#readCredit(ctl.signal)
      return answer
    } catch (error) {
      // stop() aborted it, not the caller
      if (ctl.signal.aborted && !signal.aborted) return { ok: false, error: 'off' }
      signal.throwIfAborted()
      // too slow is this model's fault, so the next one is tried
      if (error instanceof NetworkError)
        return { ok: false, error: error.timedOut ? 'failed' : 'network', detail: error.message }
      throw error
    } finally {
      this.#running.delete(ctl)
    }
  }

  stop(): void {
    for (const ctl of this.#running) ctl.abort()
    this.#running.clear()
    this.#cancelLogin()
  }

  #cancelLogin(): void {
    const login = this.#login
    if (!login) return
    login.cancelled = true
    // stops a key exchange that already started, too
    login.abort?.()
    login.close?.()
  }

  // aborts with the caller's signal, or with stop()
  #link(signal: AbortSignal): AbortController {
    const ctl = new AbortController()
    if (signal.aborted) ctl.abort(signal.reason)
    else signal.addEventListener('abort', () => ctl.abort(signal.reason), { once: true })
    this.#running.add(ctl)
    return ctl
  }

  #privacyBlocked(): boolean {
    return this.#noEndpoints >= 3
  }

  #trackPrivacy(ctx: ProviderContext, answer: Answer, no?: boolean): void {
    const before = this.#privacyBlocked()
    this.#noEndpoints = !answer.ok && no ? this.#noEndpoints + 1 : 0
    if (before !== this.#privacyBlocked()) ctx.changed()
  }

  async #load(signal: AbortSignal): Promise<ModelInfo[]> {
    const ctx = this.#ctx
    if (this.#list.length && this.clock.now() - this.#listAt < hour) return this.#list
    try {
      const res = await send(ctx!.fetch, `${api}/models`, {}, signal)
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
      const list = parseModels(JSON.parse(res.text))
      if (!list.length) throw new Error('no free models in the list')
      this.#list = list
      this.#listAt = this.clock.now()
      this.#listError = undefined
      await this.#readCredit(signal)
      ctx?.changed()
      return list
    } catch (error) {
      signal.throwIfAborted()
      this.#listError = error instanceof Error ? error.message : String(error)
      ctx?.changed()
      throw error
    }
  }

  // No credit, or a failed read, means free models only.
  async #readCredit(signal: AbortSignal): Promise<void> {
    const ctx = this.#ctx
    const key = ctx?.secrets.get('key')
    if (!ctx || !key) return
    let credit = false
    try {
      const res = await send(
        ctx.fetch,
        `${api}/credits`,
        { headers: { Authorization: `Bearer ${key}` } },
        signal
      )
      if (res.status === 200) {
        const data = (JSON.parse(res.text) as { data?: Record<string, unknown> }).data
        const { total_credits: total, total_usage: used } = data ?? {}
        credit = typeof total === 'number' && typeof used === 'number' && total - used > 0
      }
    } catch {
      signal.throwIfAborted()
    }
    this.#credit = credit
  }

  // for the model choice's list, right after start or login
  async #refresh(): Promise<void> {
    const ctl = this.#link(new AbortController().signal)
    try {
      await this.#load(ctl.signal)
    } catch {
      // #listError says it
    } finally {
      this.#running.delete(ctl)
    }
  }

  async #connect(ctx: ProviderContext): Promise<void> {
    if (this.#login) return
    const login: Login = { cancelled: false }
    this.#login = login
    this.#note = undefined
    ctx.changed()
    const ctl = this.#link(new AbortController().signal)
    login.abort = () => ctl.abort()
    try {
      // PKCE: OpenRouter checks the verifier against the challenge it was given
      const verifier = randomBytes(32).toString('base64url')
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      const cb = await ctx.callbackServer()
      login.close = () => cb.close()
      try {
        // cancelled before the server was up: no browser, no login
        if (login.cancelled) return
        ctx.openExternal(
          `${site}/auth?callback_url=${encodeURIComponent(cb.url)}` +
            `&code_challenge=${challenge}&code_challenge_method=S256&key_label=${appName}`
        )
        const code = (await cb.code).get('code')
        if (!code) throw new Error('OpenRouter sent no code')
        const res = await send(
          ctx.fetch,
          `${api}/auth/keys`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              code_verifier: verifier,
              code_challenge_method: 'S256'
            })
          },
          ctl.signal
        )
        const key = res.status === 200 ? (JSON.parse(res.text) as { key?: unknown }).key : undefined
        if (login.cancelled) return
        if (typeof key !== 'string' || !key)
          throw new Error(`OpenRouter gave no key (HTTP ${res.status})`)
        ctx.secrets.set('key', key)
        this.#noEndpoints = 0
        void this.#refresh()
      } finally {
        cb.close()
      }
    } catch (error) {
      if (!login.cancelled) {
        const why = error instanceof Error ? error.message : String(error)
        ctx.log(`login failed: ${why}`)
        this.#note = { text: `Login failed: ${why}`, error: true }
      }
    } finally {
      this.#running.delete(ctl)
      this.#login = undefined
      ctx.changed()
    }
  }
}
