import type { AiTaskInfo } from './ai'
import type { FilesChannels, LibraryApi } from './plugins/files/ipc'
import type { MfpApi, MfpChannels } from './plugins/mfp/ipc'
import type { RadioApi, RadioChannels } from './plugins/radio/ipc'
import { stationIdPattern } from './plugins/radio/ids'
import type { LinkKind } from './saved-queue'

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
  // the pages of it a queue's "From" link may open (see saved-queue.ts)
  linkKinds: LinkKind[]
  // what a live item's id must look like when read from a file (it ends up in a URL)
  liveIds?: RegExp
  // the settings field that turned it on before `plugins`, still read
  oldSwitch?: string
  // features of it that ask a language model (spec "AI models")
  aiTasks?: AiTaskInfo[]
}

// Also the order of the switches and tabs.
export const plugins: PluginInfo[] = [
  {
    id: 'files',
    name: 'Music files',
    about: 'Music in folders on this computer.',
    defaultOn: true,
    itemKind: 'track',
    offText: 'Music files are off',
    linkKinds: ['album', 'artist', 'folder']
  },
  {
    id: 'radio',
    name: 'Radio',
    about: 'Search and play internet radio stations.',
    defaultOn: true,
    itemKind: 'live',
    offText: 'Radio is off',
    linkKinds: [],
    liveIds: stationIdPattern
  },
  {
    id: 'mfp',
    name: 'Music For Programming',
    about:
      'Mixes from musicforprogramming.net, in the MFP tab. Song times inside a mix are guessed: the site gives none.',
    defaultOn: false,
    itemKind: 'track',
    offText: 'MFP is off',
    linkKinds: ['episode'],
    oldSwitch: 'mfp'
  }
]

export function isPluginId(v: unknown): v is PluginId {
  return plugins.some((p) => p.id === v)
}

// Each plugin's page-to-main channels (see PageChannels in ipc.ts).
export type PluginChannels = FilesChannels & RadioChannels & MfpChannels

// Each plugin's API on window, as the preload puts it there (preload/plugins.ts)
// and its page half reads it.
export interface PluginApis {
  libraryApi: LibraryApi
  radioApi: RadioApi
  mfpApi: MfpApi
}
