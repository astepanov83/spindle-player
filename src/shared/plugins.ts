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
  // what the queue and playlists show on its items while it is off
  offText: string
}

// Also the order of the switches and tabs.
export const plugins: PluginInfo[] = [
  {
    id: 'files',
    name: 'Music files',
    about: 'Music in folders on this computer.',
    defaultOn: true,
    itemKind: 'track',
    offText: 'Music files are off'
  },
  {
    id: 'radio',
    name: 'Radio',
    about: 'Search and play internet radio stations.',
    defaultOn: true,
    itemKind: 'live',
    offText: 'Radio is off'
  },
  {
    id: 'mfp',
    name: 'Music For Programming',
    about:
      'Mixes from musicforprogramming.net, in the MFP tab. Song times inside a mix are guessed: the site gives none.',
    defaultOn: false,
    itemKind: 'track',
    offText: 'MFP is off'
  }
]

// Plugins whose switch shows in Settings. Add 'files' (063) when it can really
// be turned off.
export const switchablePlugins: PluginId[] = ['radio', 'mfp']

export function isPluginId(v: unknown): v is PluginId {
  return plugins.some((p) => p.id === v)
}
