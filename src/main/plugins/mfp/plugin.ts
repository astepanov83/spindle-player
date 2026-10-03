// Music For Programming. Its code is still in the library process; this only
// passes the switch on until it has its own code (061).
import type { PluginId } from '../../../shared/plugins'
import type { LibraryService } from '../../library/service'
import type { MainPlugin, PluginContext } from '../types'

export class MfpPlugin implements MainPlugin {
  readonly id: PluginId = 'mfp'
  // the library reads the saved value itself when it starts
  #on = false

  constructor(private readonly library: () => LibraryService) {}

  start(ctx: PluginContext): void {
    this.#on = ctx.settings.live().plugins.mfp
  }

  setOn(on: boolean): void {
    if (on === this.#on) return
    this.#on = on
    this.library().setMfp(on)
  }

  keptCovers(): string[] {
    return []
  }

  flushSync(): void {
    // nothing of its own to write yet
  }
}
