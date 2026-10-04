// The library's tabs: each plugin that is on gives its own, in plugin list
// order, and the core's Playlists comes after the first plugin's (where it
// always was). No plugin on: no tabs, so no Playlists either.
import type { PluginId } from '../../../shared/plugins'
import type { NavKind, Tab } from './types'

export interface ShownTab extends Tab {
  plugin: PluginId | 'core'
}

export function orderTabs(perPlugin: ShownTab[][], playlists: ShownTab): ShownTab[] {
  const [first, ...rest] = perPlugin
  return first ? [...first, playlists, ...rest.flat()] : []
}

// the ones a library draws: Studio has no Songs chip
export const tabsIn = (tabs: ShownTab[], kind: NavKind): ShownTab[] =>
  tabs.filter((t) => !t.only || t.only === kind)
