import { describe, expect, it, vi } from 'vitest'
import type { AiState } from '../../shared/ai'
import { aiPageCalls } from './page-calls'
import type { AiService } from './service'

interface Stub {
  state(): AiState
  act: ReturnType<typeof vi.fn>
  setTask: ReturnType<typeof vi.fn>
  setProvider: ReturnType<typeof vi.fn>
}

function setup(): { ai: Stub; calls: ReturnType<typeof aiPageCalls> } {
  const state: AiState = {
    providers: [
      { id: 'a', name: 'A', about: '' },
      { id: 'b', name: 'B', about: '' }
    ],
    provider: 'a',
    paid: false,
    tasks: { t: { info: { id: 't', name: 'T', about: '', sends: '' }, on: false, ready: false } },
    blocks: []
  }
  const ai = {
    state: () => state,
    act: vi.fn(async () => {}),
    setTask: vi.fn(),
    setProvider: vi.fn()
  }
  return { ai, calls: aiPageCalls(ai as unknown as AiService) }
}

describe('aiPageCalls', () => {
  it('passes good values on', () => {
    const { ai, calls } = setup()
    calls.act('a', 'key', 'set', 'sk-1')
    calls.act('a', 'connect', 'press', undefined)
    calls.setTask('t', true)
    calls.setProvider('b')
    expect(ai.act).toHaveBeenCalledWith('a', 'key', 'set', 'sk-1')
    expect(ai.act).toHaveBeenCalledWith('a', 'connect', 'press', undefined)
    expect(ai.setTask).toHaveBeenCalledWith('t', true)
    expect(ai.setProvider).toHaveBeenCalledWith('b')
  })

  it('refuses an act with a wrong type, an unknown provider or a long text', () => {
    const { ai, calls } = setup()
    calls.act(1, 'key', 'set', 'x')
    calls.act('a', {}, 'set', 'x')
    calls.act('a', 'key', null, 'x')
    calls.act('a', 'key', 'set', 5)
    calls.act('zzz', 'key', 'set', 'x')
    calls.act('a', 'k'.repeat(201), 'set', 'x')
    calls.act('a', 'key', 'set', 'x'.repeat(4001))
    expect(ai.act).not.toHaveBeenCalled()
  })

  it('refuses a task switch with an unknown task, a non-boolean or a bad type', () => {
    const { ai, calls } = setup()
    calls.setTask('nope', true)
    calls.setTask('toString', true)
    calls.setTask('t', 'true')
    calls.setTask(['t'], true)
    expect(ai.setTask).not.toHaveBeenCalled()
  })

  it('refuses an unknown provider or a bad type for the choice', () => {
    const { ai, calls } = setup()
    calls.setProvider('zzz')
    calls.setProvider(undefined)
    calls.setProvider({ id: 'a' })
    expect(ai.setProvider).not.toHaveBeenCalled()
  })
})
