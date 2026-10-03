// The music files plugin's page half. Thin over the library store for now;
// the store moves here in ticket 063.
import { library } from '../../stores/library.svelte'
import type { PageHalf } from '../types'
import { canOpenFiles, filesPath, filesTabs, keepFiles } from './nav'
import { filesAct, filesEmptyPlaylists, filesPage, filesSearch } from './page'
import { filesTabOf } from './pages'
import { trackPlayable, trackState } from './tracks'

// before the first library a song is on its way, not gone
const complete = (): boolean => library.loaded

export const filesHalf: PageHalf = {
  info: (id) => trackState('files', id, complete),
  play: (id) => trackPlayable('files', id),
  tabs: filesTabs,
  tabOf: filesTabOf,
  canOpen: canOpenFiles,
  keep: keepFiles,
  path: filesPath,
  page: filesPage,
  search: filesSearch,
  emptyPlaylists: filesEmptyPlaylists,
  act: filesAct,
  version: () => library.revision
}
