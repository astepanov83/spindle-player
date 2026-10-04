// The free models from OpenRouter's list, as ModelInfo, best first.
import type { ModelInfo } from '../../types'

interface Listed {
  id?: unknown
  name?: unknown
  context_length?: unknown
  top_provider?: { context_length?: unknown; max_completion_tokens?: unknown } | null
  supported_parameters?: unknown
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined

export function parseModels(body: unknown): ModelInfo[] {
  const data = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) throw new Error('the model list has no data')
  const out: ModelInfo[] = []
  for (const m of data as Listed[]) {
    if (typeof m?.id !== 'string' || !m.id.endsWith(':free')) continue
    const context = num(m.top_provider?.context_length) ?? num(m.context_length)
    if (!context) continue
    const params = Array.isArray(m.supported_parameters) ? m.supported_parameters : []
    const schema = params.includes('response_format') || params.includes('structured_outputs')
    out.push({
      id: m.id,
      name: typeof m.name === 'string' ? m.name : m.id,
      context,
      maxOutput: num(m.top_provider?.max_completion_tokens) ?? Math.floor(context / 4),
      json: schema ? 'schema' : 'prompt'
    })
  }
  // Array.sort is stable: the same size keeps OpenRouter's order
  return out.sort((a, b) => b.context - a.context)
}
