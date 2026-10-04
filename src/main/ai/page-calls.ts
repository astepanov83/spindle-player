// What the page may ask of the AI service. The page can't be trusted, so each
// value is checked here against the state, like the library's setArtists is.
import type { AiService } from './service'

const maxId = 200
// a key or a pasted address, not a file
const maxValue = 4000

const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

export interface AiPageCalls {
  act(provider: unknown, id: unknown, actionId: unknown, value: unknown): void
  setTask(task: unknown, on: unknown): void
  setProvider(id: unknown): void
}

export function aiPageCalls(ai: AiService): AiPageCalls {
  return {
    act(provider, id, actionId, value) {
      if (!text(provider, maxId) || !text(id, maxId) || !text(actionId, maxId)) return
      if (value !== undefined && !text(value, maxValue)) return
      if (!ai.state().providers.some((p) => p.id === provider)) return
      // an act that throws is logged by the service, never the value
      void ai.act(provider, id, actionId, value)
    },
    setTask(task, on) {
      if (!text(task, maxId) || typeof on !== 'boolean') return
      if (!Object.hasOwn(ai.state().tasks, task)) return
      ai.setTask(task, on)
    },
    setProvider(id) {
      if (!text(id, maxId)) return
      if (!ai.state().providers.some((p) => p.id === id)) return
      ai.setProvider(id)
    }
  }
}
