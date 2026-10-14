// The library's tabs: each plugin that is on gives its own, in plugin list
// order, and the core's Playlists and Stats come after the first plugin's
// (where Playlists always was). No plugin on: no tabs, so none of the core's either.
import type { PluginId } from '../../../shared/plugins'
import type { NavKind, Tab } from './types'
import { parseQuery } from '../library/search-query'

export interface ShownTab extends Tab {
  plugin: PluginId | 'core'
}

export function orderTabs(perPlugin: ShownTab[][], core: ShownTab[]): ShownTab[] {
  const [first, ...rest] = perPlugin
  return first ? [...first, ...core, ...rest.flat()] : []
}

// the ones a library draws: Studio has no Songs chip
export const tabsIn = (tabs: ShownTab[], kind: NavKind): ShownTab[] =>
  tabs.filter((t) => !t.only || t.only === kind)

// The tabs a search on `shown` can send its text to (ticket 077): the others
// whose search looks wider, in tab order. None without text. A search by
// field only goes where fields are read (ticket 128): stations have none.
export function widerSearches(tabs: ShownTab[], shown: string, query: string): ShownTab[] {
  if (!query.trim()) return []
  const fields = parseQuery(query).terms.length > 0
  return tabs.filter((t) => t.searchWide && t.id !== shown && (!fields || t.fields))
}

// 'Search stations for "har"'
export const searchLabel = (t: Tab, query: string): string => `${t.search} for "${query.trim()}"`
