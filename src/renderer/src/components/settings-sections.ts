// The sections of the Settings page, in the order of its list: the core's
// own, one per plugin (named by the plugin), then the keys. A plugin's
// section has the plugin's id.
import type { PluginInfo } from '../../../shared/plugins'

export interface SettingsSection {
  id: string
  label: string
  // a plugin's section: its switch and blocks
  plugin?: PluginInfo
}

export const keysSection = 'keys'
export const layoutSection = 'layout'

export function settingsSections(plugins: PluginInfo[]): SettingsSection[] {
  return [
    { id: 'general', label: 'General' },
    { id: layoutSection, label: 'Layout' },
    ...plugins.map((p) => ({ id: p.id, label: p.name, plugin: p })),
    { id: keysSection, label: 'Keyboard' }
  ]
}

// An id that names no section (a plugin gone since) shows the first one.
export function sectionOf(sections: SettingsSection[], id: string | null): SettingsSection {
  return sections.find((s) => s.id === id) ?? sections[0]
}
