// The core of AI models (spec "AI models", "AiService"): the list of
// providers, the chosen one, the task switches, model choice and fallback,
// and the Settings state for the page. It names no provider and no task.
import type { AiClient, AiState, AiTaskInfo, Answer, JsonRequest } from '../../shared/ai'
import type { SettingBlock } from '../../shared/setting-blocks'
import type { AiSettings } from '../../shared/settings'
import { askInTurn, biggestInput, pickModels, requestSize } from './pick'
import type { CallbackServer, ModelInfo, Provider, ProviderContext, SecretStore } from './types'

export interface AiService {
  client: AiClient
  // for the page: per task, its switch and the setup blocks
  state(): AiState
  // a press, a typed text or a choice in a provider's block
  act(provider: string, id: string, actionId: string, value?: string): Promise<void>
  setTask(task: string, on: boolean): void
  setProvider(id: string): void
  // state() may have changed; gives the function that stops listening
  onState(cb: () => void): () => void
  stop(): void
}

export interface AiEnv {
  providers: Provider[]
  // from the plugin list
  tasks: AiTaskInfo[]
  // ai in settings.json
  settings: { get(): AiSettings; set(ai: AiSettings): void }
  // safe: false when keys only last until quit
  secrets: { safe: boolean; for(provider: string): SecretStore }
  fetch: typeof fetch
  openExternal(url: string): void
  callbackServer(): Promise<CallbackServer>
  log(text: string): void
}

const unsafeKeys: SettingBlock = {
  kind: 'status',
  text: "Can't store keys safely on this system. A key or login lasts until Spindle quits.",
  error: true
}

export function createAiService(env: AiEnv): AiService {
  const listeners = new Set<() => void>()
  const started = new Set<Provider>()

  const emit = (): void => {
    for (const cb of listeners) cb()
  }
  const listen = (cb: () => void): (() => void) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  // The saved one, else the first: a saved provider may be missing from this build.
  const chosen = (): Provider | undefined => {
    const id = env.settings.get().provider
    const p = env.providers.find((x) => x.info.id === id) ?? env.providers[0]
    if (p && !started.has(p)) {
      started.add(p)
      p.start(contextFor(p.info.id))
    }
    return p
  }

  const contextFor = (id: string): ProviderContext => ({
    secrets: env.secrets.for(id),
    settings: {
      get: (name) => env.settings.get().providers[id]?.[name],
      set: (name, value) => {
        const ai = env.settings.get()
        const own = { ...ai.providers[id], [name]: value }
        env.settings.set({ ...ai, providers: { ...ai.providers, [id]: own } })
      }
    },
    fetch: env.fetch,
    openExternal: env.openExternal,
    callbackServer: env.callbackServer,
    log: (text) => env.log(`AI ${id}: ${text}`),
    changed: emit
  })

  const isTask = (task: string): boolean => env.tasks.some((t) => t.id === task)
  const taskOn = (task: string): boolean => isTask(task) && env.settings.get().tasks[task] === true

  // The chosen provider when the task is on and it is ready.
  const readyFor = (task: string): Provider | undefined => {
    if (!taskOn(task)) return undefined
    const p = chosen()
    return p?.ready() ? p : undefined
  }

  // Undefined when the provider has none to give, as if off.
  const models = async (p: Provider, signal: AbortSignal): Promise<ModelInfo[] | undefined> => {
    try {
      return await p.models(signal)
    } catch (error) {
      signal.throwIfAborted()
      env.log(`AI ${p.info.id}: no model list: ${String(error)}`)
      return undefined
    }
  }

  const askOne = async (
    p: Provider,
    task: string,
    m: ModelInfo,
    req: JsonRequest,
    size: number,
    signal: AbortSignal
  ): Promise<Answer> => {
    // Switched off or away while an earlier model ran: nothing more goes to it.
    if (readyFor(task) !== p) return { ok: false, error: 'off' }
    const t0 = Date.now()
    let answer: Answer
    try {
      answer = await p.ask(m, req, signal)
    } catch (error) {
      signal.throwIfAborted()
      // a provider should answer, not throw; next model
      answer = { ok: false, error: 'failed', detail: String(error) }
    }
    // stop() aborted it, or the task was turned off: not a failure to go on
    // from. Not ready() here: a refused key must still read 'auth'.
    if (!taskOn(task) || chosen() !== p) answer = { ok: false, error: 'off' }
    const result = answer.ok ? 'ok' : answer.error
    // never the prompt, the reply or a key
    env.log(`AI ${task}: ${m.id}, ${size} tokens in, ${Date.now() - t0} ms: ${result}`)
    return answer
  }

  const client: AiClient = {
    on: (task) => !!readyFor(task),
    changed: listen,
    async maxInput(task, maxOutput, signal) {
      const p = readyFor(task)
      const list = p && (await models(p, signal))
      return list && biggestInput(list, maxOutput)
    },
    async ask(task, req, signal, avoid = []) {
      const p = readyFor(task)
      if (!p) return { ok: false, error: 'off' }
      const list = await models(p, signal)
      if (!list) return { ok: false, error: 'network' }
      const size = requestSize(req)
      if (!pickModels(list, size, req.maxOutput).length) {
        env.log(`AI ${task}: no model takes ${size} tokens in`)
        return { ok: false, error: 'too-big' }
      }
      const picked = pickModels(list, size, req.maxOutput, avoid)
      if (!picked.length) return { ok: false, error: 'failed', detail: 'every model avoided' }
      return askInTurn(picked, (m) => askOne(p, task, m, req, size, signal), signal)
    }
  }

  return {
    client,
    state() {
      const p = chosen()
      const tasks: AiState['tasks'] = {}
      for (const info of env.tasks)
        tasks[info.id] = { info, on: taskOn(info.id), ready: client.on(info.id) }
      return {
        providers: env.providers.map((x) => ({ id: x.info.id, name: x.info.name })),
        provider: p?.info.id ?? env.settings.get().provider,
        tasks,
        blocks: p ? [...(env.secrets.safe ? [] : [unsafeKeys]), ...p.blocks()] : []
      }
    },
    async act(provider, id, actionId, value) {
      const p = chosen()
      // a page that has not caught up with a change of provider
      if (p?.info.id !== provider) return
      try {
        await p.act(id, actionId, value)
      } catch (error) {
        env.log(`AI ${provider}: ${id} ${actionId} failed: ${String(error)}`)
      }
      emit()
    },
    setTask(task, on) {
      if (!isTask(task) || taskOn(task) === on) return
      const ai = env.settings.get()
      env.settings.set({ ...ai, tasks: { ...ai.tasks, [task]: on } })
      emit()
    },
    setProvider(id) {
      const next = env.providers.find((x) => x.info.id === id)
      const old = chosen()
      if (!next || next === old) return
      old?.stop()
      env.settings.set({ ...env.settings.get(), provider: id })
      chosen()
      emit()
    },
    onState: listen,
    stop() {
      for (const p of started) p.stop()
    }
  }
}
