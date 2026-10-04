// A provider for tests and app checks: a key box, two models and canned
// answers. Nothing leaves the computer. Listed only with SPINDLE_FAKE_AI=1.
import type { Answer, JsonRequest } from '../../../../shared/ai'
import type { SettingBlock } from '../../../../shared/setting-blocks'
import type { ModelInfo, Provider, ProviderContext } from '../../types'

export const fakeModels: ModelInfo[] = [
  { id: 'fake-prompt', name: 'Fake prompt model', context: 8000, maxOutput: 2000, json: 'prompt' },
  { id: 'fake-schema', name: 'Fake schema model', context: 4000, maxOutput: 1000, json: 'schema' }
]

export class FakeProvider implements Provider {
  readonly info = { id: 'fake', name: 'Test service', about: 'Canned answers, for tests.' }
  #ctx: ProviderContext | undefined

  // `answer` makes the reply; by default an empty object from the asked model
  constructor(
    readonly answer: (model: ModelInfo, req: JsonRequest) => Answer = (model) => ({
      ok: true,
      json: {},
      model: model.id
    })
  ) {}

  start(ctx: ProviderContext): void {
    this.#ctx = ctx
  }

  ready(): boolean {
    return !!this.#ctx?.secrets.get('key')
  }

  blocks(): SettingBlock[] {
    return [{ kind: 'text', id: 'key', label: 'Test key', secret: true, saved: this.ready() }]
  }

  async act(id: string, actionId: string, value?: string): Promise<void> {
    const ctx = this.#ctx
    if (!ctx || id !== 'key') return
    if (actionId === 'set' && value?.trim()) ctx.secrets.set('key', value.trim())
    else if (actionId === 'remove') ctx.secrets.remove('key')
    else return
    ctx.changed()
  }

  async models(): Promise<ModelInfo[]> {
    return fakeModels
  }

  async ask(model: ModelInfo, req: JsonRequest): Promise<Answer> {
    return this.answer(model, req)
  }

  stop(): void {
    // nothing runs in the background
  }
}
