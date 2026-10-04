// What one service that answers (a provider) gives the AI service, and what
// it gets from it. Spec "AI models", "Provider".
import type { Answer, JsonRequest, ProviderInfo } from '../../shared/ai'
import type { SettingBlock } from '../../shared/setting-blocks'

export interface Provider {
  info: ProviderInfo
  // once, when it is first chosen
  start(ctx: ProviderContext): void
  // has what it needs to ask
  ready(): boolean
  // its Settings blocks, from its own state
  blocks(): SettingBlock[]
  act(id: string, actionId: string, value?: string): Promise<void>
  // Models that can be used now, best first. Honors its own model choice:
  // a fixed choice returns just that model.
  models(signal: AbortSignal): Promise<ModelInfo[]>
  // Maps the service's errors to AnswerError: nothing above it sees HTTP codes.
  // A 'prompt' model gets the schema in the system text, and a reply that is
  // not JSON is 'failed'.
  ask(model: ModelInfo, req: JsonRequest, signal: AbortSignal): Promise<Answer>
  // turned off or quitting: abort what runs. It may be chosen again later.
  stop(): void
}

export interface ModelInfo {
  id: string
  name: string
  // tokens in + out
  context: number
  maxOutput: number
  // the service holds the answer to a schema, or only the prompt asks for JSON
  json: 'schema' | 'prompt'
}

export interface ProviderContext {
  // its own names only (kept under its id)
  secrets: SecretStore
  // its part of ai.providers in settings.json: plain values, never a key
  settings: { get(name: string): string | undefined; set(name: string, value: string): void }
  fetch: typeof fetch
  // https only
  openExternal(url: string): void
  // a one-off localhost server for a login's redirect
  callbackServer(): Promise<CallbackServer>
  log(text: string): void
  // blocks or ready() changed: the core sends the page new state
  changed(): void
}

export interface CallbackServer {
  // where the login should send the browser back to
  url: string
  // the redirect's query; rejects when closed or timed out first
  code: Promise<URLSearchParams>
  close(): void
}

export interface SecretStore {
  get(name: string): string | undefined
  set(name: string, value: string): void
  remove(name: string): void
}
