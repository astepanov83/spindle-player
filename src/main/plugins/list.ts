// The plugins, in the order of the plugin list (shared/plugins.ts). The only
// place in main that names them.
import { readFile } from 'fs/promises'
import metalOnlyLogoPath from '../../../resources/metal-only.png?asset'
import type { MainPlugin } from './types'
import { FilesPlugin } from './files/plugin'
import { MfpPlugin } from './mfp/plugin'
import { RadioPlugin } from './radio/plugin'

export interface PluginEnv {
  userData: string
  log(text: string): void
}

export function createPlugins(env: PluginEnv): MainPlugin[] {
  // opened before the files plugin starts: the library's first prune asks for their covers
  const radio = new RadioPlugin(env.userData, {
    log: env.log,
    bundledLogo: async () => new Uint8Array(await readFile(metalOnlyLogoPath))
  })
  const list: MainPlugin[] = []
  const files = new FilesPlugin({
    keptByOthers: () => list.flatMap((p) => p.keptCovers())
  })
  list.push(files, radio, new MfpPlugin(env.userData, { log: env.log }))
  return list
}
