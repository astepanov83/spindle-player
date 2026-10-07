// Asking a language model for a JSON answer (spec "AI models"). A task (a
// feature of a plugin) knows the prompt and the answer's shape, never which
// service answers. These types are shared so the library process and the page
// can use them too.
import type { SettingBlock } from './setting-blocks'

// A task, listed in the plugin list so the core can draw its switch
// without importing the plugin.
export interface AiTaskInfo {
  id: string
  name: string
  // the line under the switch
  about: string
  // what leaves the computer, said in Settings
  sends: string
}

// One service that answers, like OpenRouter.
export interface ProviderInfo {
  id: string
  name: string
  about: string
}

// A JSON Schema for the answer, as plain JSON.
export type JsonSchema = { [key: string]: unknown }

export interface JsonRequest {
  system: string
  user: string
  // the answer's shape
  schema: JsonSchema
  // tokens
  maxOutput: number
}

// `json` is parsed but not checked: the task checks the shape itself.
// `avoided` comes with 'failed' when every model that fits was in `avoid`
// (a fixed model choice, or only one model takes the request): nothing was
// sent, and asking again without `avoid` may still answer.
// `usage` is what the ask used, when the service says, for the log.
export type Answer =
  | { ok: true; json: unknown; model: string; usage?: Usage }
  | {
      ok: false
      error: AnswerError
      retryAt?: number
      detail?: string
      avoided?: true
      usage?: Usage
    }

// Tokens in and out of one ask, and its cost in US dollars when known.
export interface Usage {
  tokensIn: number
  tokensOut: number
  cost?: number
}

// What a task can act on, the same for every provider.
export type AnswerError =
  // task switched off, or no provider ready
  | 'off'
  // key refused; the provider forgets it and shows its login again
  | 'auth'
  // rate or daily limit; retryAt (ms since 1970) when known. Stop and go on later.
  | 'limit'
  // no model takes a request this big
  | 'too-big'
  | 'network'
  // every model failed or gave broken JSON
  | 'failed'

// What a task gets. The same in main and, as messages to main, in the
// library process, so the key and the network stay in main.
export interface AiClient {
  // switched on and the provider is ready: the task may ask
  on(task: string): boolean
  // switched on, ready or not: the task keeps using what it saved, e.g.
  // while a key is gone until the user connects again
  enabled(task: string): boolean
  // on() or enabled() may have changed; gives the function that stops listening
  changed(cb: () => void): () => void
  // the biggest request (system + user, tokens) a model takes now, or undefined when off
  maxInput(task: string, maxOutput: number, signal: AbortSignal): Promise<number | undefined>
  // avoid: model ids not to use, e.g. to get a second answer from another model
  ask(task: string, req: JsonRequest, signal: AbortSignal, avoid?: string[]): Promise<Answer>
}

// What the page gets to draw each task's place in Settings.
export interface AiState {
  // for the service choice, shown with 2+, and the chosen one's about line
  providers: ProviderInfo[]
  // the chosen one
  provider: string
  // the chosen provider is ready and an ask may cost money now (paid models),
  // so a task asks before a big run
  paid: boolean
  // per task id: `ready` is on() of AiClient
  tasks: Record<string, { info: AiTaskInfo; on: boolean; ready: boolean }>
  // the chosen provider's setup blocks, shared by every task that is on
  blocks: SettingBlock[]
}
