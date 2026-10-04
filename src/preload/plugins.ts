// Each plugin's API for its page half, by its name on window. The only file of
// the preload that names the plugins.
import { filesPreload } from '../main/plugins/files/preload'
import { mfpPreload } from '../main/plugins/mfp/preload'
import { radioPreload } from '../main/plugins/radio/preload'
import type { PluginApis } from '../shared/plugins'

export function pluginApis(): PluginApis {
  return { libraryApi: filesPreload(), radioApi: radioPreload(), mfpApi: mfpPreload() }
}
