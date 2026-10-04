// One chat request to OpenRouter, and its errors as AnswerError.
import type { Answer, JsonRequest } from '../../../../shared/ai'
import type { ModelInfo } from '../../types'
import { api } from './api'

export const appName = 'Spindle'

export function requestBody(model: ModelInfo, req: JsonRequest): Record<string, unknown> {
  const schema = model.json === 'schema'
  // a model that can't hold the answer to a schema gets it in the prompt
  const system = schema
    ? req.system
    : `${req.system}\n\nAnswer with only JSON that fits this JSON Schema:\n${JSON.stringify(req.schema)}`
  return {
    model: model.id,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: req.user }
    ],
    temperature: 0,
    max_tokens: Math.min(req.maxOutput, model.maxOutput),
    ...(schema && {
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'answer', strict: true, schema: req.schema }
      }
    })
  }
}

export const chatUrl = `${api}/chat/completions`

type HeaderGet = (name: string) => string | null | undefined

// When the limit lifts, in ms since 1970. Retry-After is seconds or a date;
// X-RateLimit-Reset is a time in ms.
export function retryAt(header: HeaderGet, now: number): number | undefined {
  const after = header('retry-after')
  if (after) {
    const secs = Number(after)
    if (Number.isFinite(secs)) return now + secs * 1000
    const date = Date.parse(after)
    if (!Number.isNaN(date)) return date
  }
  const reset = Number(header('x-ratelimit-reset'))
  if (reset > 1e12) return reset
  if (reset > 1e9) return reset * 1000
  return undefined
}

export interface Result {
  answer: Answer
  // the user's privacy settings rule out every provider of this model
  noEndpoints?: boolean
}

interface ErrorBody {
  error?: {
    code?: unknown
    message?: unknown
    metadata?: { headers?: unknown; provider_name?: unknown }
  }
}

// The free daily limit's 429 has its reset time only in the body, under
// error.metadata.headers, with any case of names.
function bodyHeaders(body: ErrorBody | undefined): HeaderGet {
  const h = body?.error?.metadata?.headers
  if (!h || typeof h !== 'object') return () => undefined
  const lower = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))
  return (name) => {
    const v = lower.get(name)
    return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined
  }
}

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// Strips a ```json fence: some models add one even when asked for bare JSON.
function reply(text: string): unknown {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text)
  return parse(fenced ? fenced[1] : text)
}

// The Answer for a finished request. `onAuth` forgets the key.
export function answerFor(
  model: ModelInfo,
  status: number,
  headers: Headers,
  text: string,
  now: number,
  onAuth: () => void
): Result {
  const body = parse(text) as (ErrorBody & { choices?: unknown }) | undefined
  // OpenRouter sometimes puts the error in a 200 reply
  const code = typeof body?.error?.code === 'number' ? body.error.code : status
  const message = typeof body?.error?.message === 'string' ? body.error.message : ''
  const fail = (a: Omit<Extract<Answer, { ok: false }>, 'ok'>, noEndpoints?: boolean): Result => ({
    answer: { ok: false, ...a },
    noEndpoints
  })

  // 403 is a moderation flag or a guardrail block, not a bad key: next model
  if (code === 401) {
    onAuth()
    return fail({ error: 'auth', detail: 'HTTP 401' })
  }
  // a 429 that names the model's provider means that one model is busy, not
  // that the account hit its limit: the next model is tried
  if (code === 429 && typeof body?.error?.metadata?.provider_name === 'string')
    return fail({
      error: 'failed',
      detail: `HTTP 429: ${body.error.metadata.provider_name} is busy`
    })
  if (code === 429) {
    const at = retryAt((n) => headers.get(n), now) ?? retryAt(bodyHeaders(body), now)
    return fail({ error: 'limit', retryAt: at, detail: 'HTTP 429' })
  }
  if (code !== 200 || body?.error) {
    const noEndpoints = code === 404 || /no endpoints/i.test(message)
    const detail = `HTTP ${code}${message ? `: ${message}` : ''}`.slice(0, 300)
    return fail({ error: 'failed', detail }, noEndpoints)
  }
  const choices = body?.choices as { message?: { content?: unknown } }[] | undefined
  const content = choices?.[0]?.message?.content
  const json = typeof content === 'string' ? reply(content) : undefined
  if (json === undefined) return fail({ error: 'failed', detail: 'the reply is not JSON' })
  return { answer: { ok: true, json, model: model.id } }
}
