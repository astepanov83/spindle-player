import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiState } from '../../shared/ai'
import type { AiApi } from '../../shared/ipc'
import { aiBlocks } from './ai-blocks'

const info = { id: 't', name: 'Task', about: 'About', sends: 'Sends names.' }
const state = (provider: string): AiState => ({
  providers: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' }
  ],
  provider,
  tasks: { t: { info, on: true, ready: false } },
  blocks: [{ kind: 'button', id: 'connect', label: 'Connect' }]
})

let store: typeof import('./ai.svelte')
let push: (s: AiState) => void
let answer: (s: AiState) => void
let api: AiApi
const act = vi.fn()

beforeEach(async () => {
  act.mockClear()
  vi.resetModules()
  store = await import('./ai.svelte')
  api = {
    load: () => new Promise((r) => (answer = r)),
    onState: (l) => {
      push = l
      return () => {}
    },
    act,
    setTask: vi.fn(),
    setProvider: vi.fn()
  }
})

const buttonId = (task = 't'): string => {
  const b = aiBlocks(task, store.ai.state).find((x) => x.kind === 'button')
  return b && 'id' in b ? b.id : ''
}

describe('page AI store', () => {
  it('has no state until main answers', () => {
    store.startAi(api)
    expect(store.ai.state).toBeUndefined()
    store.actOnAi('ai/task/t/', 'set', 'true')
    expect(api.setTask).not.toHaveBeenCalled()
  })

  it('takes the answer, and a pushed state that came first is kept', async () => {
    store.startAi(api)
    push(state('b'))
    answer(state('a'))
    await Promise.resolve()
    expect(store.ai.state?.provider).toBe('b')
  })

  it('takes the answer when nothing was pushed, then each push', async () => {
    store.startAi(api)
    answer(state('a'))
    await Promise.resolve()
    expect(store.ai.state?.provider).toBe('a')
    push(state('b'))
    expect(store.ai.state?.provider).toBe('b')
  })

  it('survives a failed load', async () => {
    api.load = () => Promise.reject(new Error('no'))
    store.startAi(api)
    await Promise.resolve()
    expect(store.ai.state).toBeUndefined()
  })

  it('sends the task switch, the service choice and a provider act to main', async () => {
    store.startAi(api)
    push(state('a'))
    const blocks = aiBlocks('t', store.ai.state)
    const idOf = (kind: string): string => {
      const b = blocks.find((x) => x.kind === kind)
      return b && 'id' in b ? b.id : ''
    }
    store.actOnAi(idOf('switch'), 'set', 'false')
    expect(api.setTask).toHaveBeenCalledWith('t', false)
    store.actOnAi(idOf('choice'), 'set', 'b')
    expect(api.setProvider).toHaveBeenCalledWith('b')
    store.actOnAi(buttonId(), 'press')
    expect(act).toHaveBeenCalledWith('a', 'connect', 'press', undefined)
  })

  it('acts on the provider chosen now', () => {
    store.startAi(api)
    push(state('b'))
    store.actOnAi(buttonId(), 'press')
    expect(act).toHaveBeenCalledWith('b', 'connect', 'press', undefined)
  })
})
