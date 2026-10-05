// Music files' part of the preload: `window.libraryApi`. Runs in the page's
// sandboxed preload, so it may only use ipcRenderer and webUtils.
import { webUtils } from 'electron'
import { mergeMoves, type IdMoves } from '../../../shared/id-moves'
import type { ScanStatus } from '../../../shared/library'
import { LibraryChannel, maxDropped, type LibraryApi } from '../../../shared/plugins/files/ipc'
import { invoke, latest, send } from '../../../preload/ipc'

// Paths only for files dragged in from the system: a file the page made
// itself has none, so the page can't name a path for main to add. One more
// than main takes is enough for main to turn a big drop down.
function droppedPaths(files: unknown): string[] {
  if (!Array.isArray(files)) return []
  return files.slice(0, maxDropped + 1).map((f) => {
    try {
      return webUtils.getPathForFile(f)
    } catch {
      return ''
    }
  })
}

export function filesPreload(): LibraryApi {
  // Asked for early: the first paint shows the library from the index.
  const library = invoke(LibraryChannel.load)
  const onLibraryChanged = latest<Uint8Array>(LibraryChannel.changed)
  const onScanStatus = latest<ScanStatus>(LibraryChannel.status)
  // each map matters, so two that come early are joined
  const onIdsMoved = latest<IdMoves>(LibraryChannel.idsMoved, mergeMoves)
  return {
    load: () => library,
    get: () => invoke(LibraryChannel.get),
    addFolder: () => invoke(LibraryChannel.addFolder),
    addDropped: (files) => invoke(LibraryChannel.addDropped, droppedPaths(files)),
    removeFolder: (path) => send(LibraryChannel.removeFolder, path),
    rescan: () => send(LibraryChannel.rescan),
    setArtists: (changes) => send(LibraryChannel.setArtists, changes),
    aiRecheck: () => send(LibraryChannel.aiRecheck),
    showFolder: (parts) => invoke(LibraryChannel.showFolder, parts),
    onChanged: onLibraryChanged,
    onStatus: onScanStatus,
    onIdsMoved
  }
}
