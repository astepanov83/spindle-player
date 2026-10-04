// The AI service's state on the page: what main last said, and ways to ask it
// for a change. Main owns the state; nothing is kept here but its last copy.
import type { AiState } from '../../shared/ai'
import type { AiApi } from '../../shared/ipc'
import { aiTarget } from './ai-blocks'

export const ai: { state: AiState | undefined } = $state({ state: undefined })

let api: AiApi | undefined

// Hears main from now on, and asks for the state once. A pushed state is
// newer than the answer, which may arrive after it.
export function startAi(to: AiApi): void {
  api = to
  to.onState((s) => (ai.state = s))
  void to.load().then(
    (s) => (ai.state ??= s),
    () => {}
  )
}

// A block the `ai` view drew was used: the task switch, the service choice,
// or one of the chosen provider's blocks (acted on that provider).
export function actOnAi(blockId: string, actionId: string, value?: string): void {
  const target = aiTarget(blockId)
  const state = ai.state
  if (!api || !state || !target) return
  if (target.to === 'task') api.setTask(target.task, value === 'true')
  else if (target.to === 'provider-choice') {
    if (value !== undefined) api.setProvider(value)
  } else api.act(state.provider, target.id, actionId, value)
}
