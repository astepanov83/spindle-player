// Each plugin's API for its page half, by its name on window. The only file of
// the preload that names the plugins.
import { filesPreload } from '../main/plugins/files/preload'
import { mfpPreload } from '../main/plugins/mfp/preload'
import { radioPreload } from '../main/plugins/radio/preload'

export function pluginApis(): Record<string, unknown> {
  return { libraryApi: filesPreload(), radioApi: radioPreload(), mfpApi: mfpPreload() }
}
