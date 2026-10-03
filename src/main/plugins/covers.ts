import type { CoverProvider, CoverService } from './types'

// Holds the cover service the files plugin gives, for plugins that start after it.
export class Covers implements CoverProvider {
  #service: CoverService | undefined

  provide(service: CoverService): void {
    this.#service = service
  }

  get(): CoverService {
    if (!this.#service) throw new Error('No plugin has provided the cover service yet')
    return this.#service
  }

  kept(): void {
    this.#service?.kept()
  }
}
