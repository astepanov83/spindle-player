// What kind of thing a plugin plays. Moves to shared/plugins/ with the item types.
export type ItemKind = 'track' | 'live'

export type PluginId = 'files' | 'radio' | 'mfp'

export interface PluginInfo {
  id: PluginId
  name: string
  // the line under its switch
  about: string
  defaultOn: boolean
  itemKind: ItemKind
}

// Also the order of the switches and tabs.
export const plugins: PluginInfo[] = [
  {
    id: 'files',
    name: 'Music files',
    about: 'Music in folders on this computer.',
    defaultOn: true,
    itemKind: 'track'
  },
  {
    id: 'radio',
    name: 'Radio',
    about: 'Search and play internet radio stations.',
    defaultOn: true,
    itemKind: 'live'
  },
  {
    id: 'mfp',
    name: 'Music For Programming',
    about: 'Mixes from musicforprogramming.net.',
    defaultOn: false,
    itemKind: 'track'
  }
]

// Plugins whose switch shows in Settings. Add 'radio' (057) and 'files' (063)
// when they can really be turned off.
export const switchablePlugins: PluginId[] = ['mfp']

export function isPluginId(v: unknown): v is PluginId {
  return plugins.some((p) => p.id === v)
}
