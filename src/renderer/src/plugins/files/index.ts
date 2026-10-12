// The music files plugin's page half, over its store (store.svelte.ts).
import { files } from './store.svelte'
import type { PageHalf } from '../types'
import { canOpenFiles, filesLook, filesPath, filesTabs, keepFiles } from './nav'
import { filesAct, filesEmptyPlaylists, filesPage, filesSearch, filesTile } from './page'
import { filesDrop } from './drop'
import { startFiles } from './start'
import { filesTabOf } from './pages'
import { filesActSetting, filesCoverLines, filesSettings, filesStatusLine } from './settings'
import { trackPlayable, trackState } from './tracks'
import { findIn, songIndex } from './find-song'
import type { Album } from '../../../../shared/library'

// before the first library, or the first scan of an empty index, a song is on its way, not gone
const complete = (): boolean => files.loaded && !files.partial

// made again after each library or patch, when first asked
let byName: { revision: number; index: Map<string, string> } | undefined
function findSong(artist: string, title: string): string | undefined {
  const revision = files.revision
  if (byName?.revision !== revision)
    byName = { revision, index: songIndex(files.albums, (id) => files.track(id)) }
  return findIn(byName.index, artist, title)
}

// made again when an album changed (the list of albums is then a new one)
let all: { albums: Album[]; list: { id: string; added: number }[] } | undefined
function songs(): readonly { id: string; added: number }[] {
  const albums = files.albums
  if (all?.albums !== albums)
    all = { albums, list: albums.flatMap((a) => a.trackIds.map((id) => ({ id, added: a.added }))) }
  return all.list
}

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
  tileOf: filesTile,
  emptyPlaylists: filesEmptyPlaylists,
  act: filesAct,
  settings: filesSettings,
  actSetting: filesActSetting,
  version: () => files.revision,
  statusLine: filesStatusLine,
  coverLines: filesCoverLines,
  drop: filesDrop,
  start: startFiles,
  findSong,
  songs
}
