// The free models and the two paid ones from OpenRouter's list, as ModelInfo,
// best first: the paid ones, then the free ones.
import type { ModelInfo } from '../../types'

// best first. Used only while the account has credit.
export const paidIds = ['google/gemini-3.8-flash', 'anthropic/claude-sonnet-5.5']

export const isFree = (id: string): boolean => id.endsWith(':free')

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
    if (typeof m?.id !== 'string' || !(isFree(m.id) || paidIds.includes(m.id))) continue
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
  // a free model ranks after both paid ones
  const rank = (id: string): number => (isFree(id) ? paidIds.length : paidIds.indexOf(id))
  // Array.sort is stable: the same size keeps OpenRouter's order
  return out.sort((a, b) => rank(a.id) - rank(b.id) || b.context - a.context)
}
