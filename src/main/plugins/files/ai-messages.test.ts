// The library process's AiClient and main's half, joined by plain functions
// in place of the process's messages.
import { describe, expect, it } from 'vitest'
import type { AiClient, Answer, JsonRequest } from '../../../shared/ai'
import { AiOverMessages, AiRequests } from './ai-messages'
import type { WorkerIn, WorkerOut } from './types'

const req: JsonRequest = { system: 's', user: 'u', schema: {}, maxOutput: 10 }
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

// main's AiClient: answers when `release` is called, and keeps the signals it got
function mainAi(answer: Answer = { ok: true, json: { a: 1 }, model: 'm' }): {
  ai: AiClient
  calls: { task: string; avoid?: string[]; signal: AbortSignal }[]
  release(): void
} {
  const calls: { task: string; avoid?: string[]; signal: AbortSignal }[] = []
  let release = (): void => {}
  const held = new Promise<void>((r) => (release = r))
  const ai: AiClient = {
    on: () => true,
    enabled: () => true,
    changed: () => () => {},
    maxInput: async () => 1234,
    ask: async (task, _req, signal, avoid) => {
      calls.push({ task, signal, ...(avoid ? { avoid } : {}) })
      await held
      signal.throwIfAborted()
      return answer
    }
  }
  return { ai, calls, release: () => release() }
}

function wire(ai: AiClient | undefined): {
  client: AiOverMessages
  toMain: WorkerOut[]
  toProcess: WorkerIn[]
  main: AiRequests
} {
  const toMain: WorkerOut[] = []
  const toProcess: WorkerIn[] = []
  const client = new AiOverMessages((m) => {
    toMain.push(m)
    main.onMessage(m)
  })
  const main = new AiRequests(
    ai,
    ['artist-groups'],
    (m) => {
      toProcess.push(m)
      if (m.type === 'ai-reply') client.reply(m)
    },
    () => {}
  )
  return { client, toMain, toProcess, main }
}

describe('AiClient over messages', () => {
  it('asks main and gets its answer, with the models to avoid', async () => {
    const m = mainAi()
    const w = wire(m.ai)
    const answer = w.client.ask('artist-groups', req, new AbortController().signal, ['x'])
    m.release()
    expect(await answer).toEqual({ ok: true, json: { a: 1 }, model: 'm' })
    expect(m.calls[0]).toMatchObject({ task: 'artist-groups', avoid: ['x'] })
    expect(w.toMain[0]).toEqual({ type: 'ai-ask', id: 1, task: 'artist-groups', req, avoid: ['x'] })
  })

  it('asks main for maxInput', async () => {
    const w = wire(mainAi().ai)
    expect(await w.client.maxInput('artist-groups', 10, new AbortController().signal)).toBe(1234)
  })

  it('on an abort rejects at once and main aborts its call, sending no answer', async () => {
    const m = mainAi()
    const w = wire(m.ai)
    const stop = new AbortController()
    const answer = w.client.ask('artist-groups', req, stop.signal)
    stop.abort()
    await expect(answer).rejects.toThrow()
    expect(w.toMain.at(-1)).toEqual({ type: 'ai-cancel', id: 1 })
    expect(m.calls[0].signal.aborted).toBe(true)
    m.release()
    await tick()
    expect(w.toProcess).toEqual([])
  })

  it('answers off with no AI service, or for a task that is not this plugin', async () => {
    const signal = new AbortController().signal
    expect(await wire(undefined).client.ask('artist-groups', req, signal)).toEqual({
      ok: false,
      error: 'off'
    })
    expect(await wire(mainAi().ai).client.ask('other', req, signal)).toEqual({
      ok: false,
      error: 'off'
    })
  })

  it('answers failed when main call throws', async () => {
    const ai = { ...mainAi().ai, ask: async () => Promise.reject(new Error('x')) }
    const w = wire(ai)
    expect(await w.client.ask('artist-groups', req, new AbortController().signal)).toEqual({
      ok: false,
      error: 'failed'
    })
  })

  it('stops every call when the library process ends', () => {
    const m = mainAi()
    const w = wire(m.ai)
    void w.client.ask('artist-groups', req, new AbortController().signal)
    w.main.stopAll()
    expect(m.calls[0].signal.aborted).toBe(true)
  })

  it('says on() and enabled() as main last sent them, and tells listeners', () => {
    const w = wire(undefined)
    let heard = 0
    w.client.changed(() => heard++)
    expect(w.client.on('artist-groups')).toBe(false)
    expect(w.client.enabled('artist-groups')).toBe(false)
    // switched on, the provider not ready
    w.client.setOn({}, { 'artist-groups': true })
    expect(w.client.on('artist-groups')).toBe(false)
    expect(w.client.enabled('artist-groups')).toBe(true)
    w.client.setOn({ 'artist-groups': true }, { 'artist-groups': true })
    expect(w.client.on('artist-groups')).toBe(true)
    expect(heard).toBe(2)
  })

  it("rejects maxInput when main's maxInput throws, so it is not read as off", async () => {
    const signal = new AbortController().signal
    const ai = { ...mainAi().ai, maxInput: async () => Promise.reject(new Error('x')) }
    await expect(wire(ai).client.maxInput('artist-groups', 10, signal)).rejects.toThrow(
      'maxInput failed'
    )
    // off is still off
    expect(await wire(undefined).client.maxInput('artist-groups', 10, signal)).toBeUndefined()
  })
})
