// What the player says under "Nothing playing", and the Settings section its
// "Open Settings" button opens (null: no button).
import { layoutSection } from '../components/settings-sections'

export function startHint(o: { anyPluginOn: boolean; hasLibrary: boolean; firstPlugin: string }): {
  text: string
  settings: string | null
} {
  // with every plugin off there is nothing to pick from; the first plugin's
  // section has its switch
  if (!o.anyPluginOn) return { text: 'Turn on a plugin in Settings', settings: o.firstPlugin }
  // Focus has no library to pick from
  if (!o.hasLibrary)
    return { text: 'Switch to Studio or Classic to pick music', settings: layoutSection }
  return { text: 'Pick an album or a song to start', settings: null }
}
