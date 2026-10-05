// Which models a request goes to, and the next one after a failure.
// Spec "AiService": the provider gives its models best first, the core picks.
import type { Answer, JsonRequest } from '../../shared/ai'
import type { ModelInfo } from './types'

// models asked per request at most, the first one included
export const maxTries = 3

// Rough on purpose: real tokens are nearer 4 characters, which is the margin.
export function tokens(text: string): number {
  return Math.ceil(text.length / 3)
}

export function requestSize(req: JsonRequest): number {
  return tokens(req.system) + tokens(req.user)
}

// The answer is capped by the model's own limit (as the provider sends it),
// so a model with a lower one still takes the request.
const outOf = (m: ModelInfo, maxOutput: number): number => Math.min(maxOutput, m.maxOutput)

function fits(m: ModelInfo, size: number, maxOutput: number): boolean {
  return size + outOf(m, maxOutput) <= m.context
}

// The models that take the request and are not in `avoid`, those that hold
// the answer to a schema first, each kind in the provider's order.
export function pickModels(
  models: ModelInfo[],
  size: number,
  maxOutput: number,
  avoid: string[] = []
): ModelInfo[] {
  const ok = models.filter((m) => fits(m, size, maxOutput) && !avoid.includes(m.id))
  return [...ok.filter((m) => m.json === 'schema'), ...ok.filter((m) => m.json !== 'schema')]
}

// The biggest request (tokens in) any model takes with this much out.
export function biggestInput(models: ModelInfo[], maxOutput: number): number | undefined {
  const sizes = models.map((m) => m.context - outOf(m, maxOutput)).filter((n) => n > 0)
  return sizes.length ? Math.max(...sizes) : undefined
}

// Asks the models in turn. Only 'failed' goes on to the next model: a refused
// key, a limit or the network would fail the same way there.
export async function askInTurn(
  models: ModelInfo[],
  ask: (m: ModelInfo) => Promise<Answer>,
  signal: AbortSignal
): Promise<Answer> {
  let last: Answer = { ok: false, error: 'failed' }
  for (const m of models.slice(0, maxTries)) {
    signal.throwIfAborted()
    last = await ask(m)
    if (last.ok || last.error !== 'failed') return last
  }
  return last
}
