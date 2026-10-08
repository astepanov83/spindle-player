// The music files plugin's page half, over its store (store.svelte.ts).
import { files } from './store.svelte'
import type { PageHalf } from '../types'
import { canOpenFiles, filesLook, filesPath, filesTabs, keepFiles } from './nav'
import { filesAct, filesEmptyPlaylists, filesPage, filesSearch } from './page'
import { filesDrop } from './drop'
import { startFiles } from './start'
import { filesTabOf } from './pages'
import {
  filesActSetting,
  filesCoverLines,
  filesSettings,
  filesSoundLine,
  filesStatusLine
} from './settings'
import { trackPlayable, trackState } from './tracks'

// before the first library, or the first scan of an empty index, a song is on its way, not gone
const complete = (): boolean => files.loaded && !files.partial

export const filesHalf: PageHalf = {
  info: (id) => trackState(id, complete),
  play: (id) => trackPlayable(id),
  tabs: filesTabs,
  tabOf: filesTabOf,
  canOpen: canOpenFiles,
  keep: keepFiles,
  path: filesPath,
  look: filesLook,
  page: filesPage,
  search: filesSearch,
  emptyPlaylists: filesEmptyPlaylists,
  act: filesAct,
  settings: filesSettings,
  actSetting: filesActSetting,
  version: () => files.revision,
  statusLine: filesStatusLine,
  coverLines: filesCoverLines,
  soundLine: filesSoundLine,
  drop: filesDrop,
  start: startFiles
}
