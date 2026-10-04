// AiClient for the library process (ticket 068, spec "AI models"): only
// messages cross, the request and the answer. Main calls its own AiClient,
// so the key and the network stay there. Both halves are here, plain TS with
// the posting handed in, so they are tested together.
import type { AiClient, Answer, JsonRequest } from '../../../shared/ai'
import type { WorkerIn, WorkerOut } from './types'

type Call =
  | { type: 'ai-ask'; task: string; req: JsonRequest; avoid?: string[] }
  | { type: 'ai-max-input'; task: string; maxOutput: number }
type Reply = Extract<WorkerIn, { type: 'ai-reply' }>

// The library process's half. on() is what main last sent ('ai-on').
export class AiOverMessages implements AiClient {
  #next = 0
  #waiting = new Map<number, (r: Reply) => void>()
  #on: Record<string, boolean> = {}
  #listeners = new Set<() => void>()

  constructor(readonly post: (m: WorkerOut) => void) {}

  setOn(tasks: Record<string, boolean>): void {
    this.#on = tasks
    for (const f of [...this.#listeners]) f()
  }

  on(task: string): boolean {
    return !!this.#on[task]
  }

  changed(cb: () => void): () => void {
    this.#listeners.add(cb)
    return () => this.#listeners.delete(cb)
  }

  async maxInput(
    task: string,
    maxOutput: number,
    signal: AbortSignal
  ): Promise<number | undefined> {
    return (await this.#call({ type: 'ai-max-input', task, maxOutput }, signal)).max
  }

  async ask(
    task: string,
    req: JsonRequest,
    signal: AbortSignal,
    avoid?: string[]
  ): Promise<Answer> {
    const r = await this.#call({ type: 'ai-ask', task, req, ...(avoid ? { avoid } : {}) }, signal)
    return r.answer ?? { ok: false, error: 'failed' }
  }

  // main's answer to a call
  reply(r: Reply): void {
    this.#waiting.get(r.id)?.(r)
  }

  // An abort rejects at once and tells main to stop the call; a late answer is dropped.
  #call(m: Call, signal: AbortSignal): Promise<Reply> {
    if (signal.aborted) return Promise.reject(signal.reason)
    const id = ++this.#next
    return new Promise<Reply>((resolve, reject) => {
      const abort = (): void => {
        this.#waiting.delete(id)
        this.post({ type: 'ai-cancel', id })
        reject(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
      this.#waiting.set(id, (r) => {
        this.#waiting.delete(id)
        signal.removeEventListener('abort', abort)
        resolve(r)
      })
      this.post({ ...m, id })
    })
  }
}

// Main's half: calls `ai` for the library process, only for this plugin's tasks.
export class AiRequests {
  #running = new Map<number, AbortController>()

  constructor(
    readonly ai: AiClient | undefined,
    readonly tasks: string[],
    readonly post: (m: WorkerIn) => void,
    readonly log: (text: string) => void = (t) => console.error(t)
  ) {}

  // false for a message that is not a call
  onMessage(m: WorkerOut): boolean {
    switch (m.type) {
      case 'ai-ask':
        this.#run(m.id, m.task, (ai, signal) =>
          ai.ask(m.task, m.req, signal, m.avoid).then((answer) => ({ answer }))
        )
        return true
      case 'ai-max-input':
        this.#run(m.id, m.task, (ai, signal) =>
          ai.maxInput(m.task, m.maxOutput, signal).then((max) => ({ max }))
        )
        return true
      case 'ai-cancel':
        this.#running.get(m.id)?.abort()
        this.#running.delete(m.id)
        return true
      default:
        return false
    }
  }

  // The library process ended: nobody waits for these any more.
  stopAll(): void {
    for (const c of this.#running.values()) c.abort()
    this.#running.clear()
  }

  #run(
    id: number,
    task: string,
    call: (ai: AiClient, signal: AbortSignal) => Promise<Omit<Reply, 'type' | 'id'>>
  ): void {
    const ai = this.ai
    if (!ai || !this.tasks.includes(task)) {
      this.post({ type: 'ai-reply', id, answer: { ok: false, error: 'off' } })
      return
    }
    const c = new AbortController()
    this.#running.set(id, c)
    call(ai, c.signal)
      .then(
        (r) => {
          if (!c.signal.aborted) this.post({ type: 'ai-reply', id, ...r })
        },
        (e) => {
          if (c.signal.aborted) return
          this.log(`AI request failed: ${e}`)
          this.post({ type: 'ai-reply', id, answer: { ok: false, error: 'failed' } })
        }
      )
      .finally(() => {
        if (this.#running.get(id) === c) this.#running.delete(id)
      })
  }
}
