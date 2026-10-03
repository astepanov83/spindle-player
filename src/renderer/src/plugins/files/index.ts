// The music files plugin's page half, over its store (store.svelte.ts).
import { files } from './store.svelte'
import type { PageHalf } from '../types'
import { canOpenFiles, filesPath, filesTabs, keepFiles } from './nav'
import { filesAct, filesEmptyPlaylists, filesPage, filesSearch } from './page'
import { filesTabOf } from './pages'
import { filesActSetting, filesCoverLines, filesSettings, filesStatusLine } from './settings'
import { trackPlayable, trackState } from './tracks'

// before the first library a song is on its way, not gone
const complete = (): boolean => files.loaded

export const filesHalf: PageHalf = {
  info: (id) => trackState(id, complete),
  play: (id) => trackPlayable(id),
  tabs: filesTabs,
  tabOf: filesTabOf,
  canOpen: canOpenFiles,
  keep: keepFiles,
  path: filesPath,
  page: filesPage,
  search: filesSearch,
  emptyPlaylists: filesEmptyPlaylists,
  act: filesAct,
  settings: filesSettings,
  actSetting: filesActSetting,
  version: () => files.revision,
  statusLine: filesStatusLine,
  coverLines: filesCoverLines
}
