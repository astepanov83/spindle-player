// Music files' messages between main, the preload and its page half.
import type { IdMoves } from '../../id-moves'
import type { ScanStatus } from '../../library'
import type { ArtistChanges } from './artist-edit'

export const LibraryChannel = {
  load: 'library:load',
  // the whole library now, for a page that missed a patch
  get: 'library:get',
  addFolder: 'library:add-folder',
  // folders dropped on the window, as paths the preload got from the files
  addDropped: 'library:add-dropped',
  removeFolder: 'library:remove-folder',
  rescan: 'library:rescan',
  setArtists: 'library:set-artists',
  showFolder: 'library:show-folder',
  // main to page: what changed in the library (a patch, see library-patch.ts)
  changed: 'library:changed',
  // main to page: scan progress and the folder list
  status: 'library:status',
  // main to page: track ids that changed, sent before the library that has them
  idsMoved: 'library:ids-moved'
} as const

// What came of a drop: the folders added, and how many were music folders
// already or were not folders at all (files, or paths that are gone).
export interface DropResult {
  added: string[]
  known: number
  other: number
  // settings.json could not be read, so nothing was added
  unreadable?: true
}

// More paths than a person drags at once; such a list is not taken at all.
// The preload sends at most one more, so main still sees it is too many.
export const maxDropped = 50

// What the preload exposes to the page as `window.libraryApi`.
// Main owns the folder list and the index; the page only asks.
export interface LibraryApi {
  // The library as it was when the page loaded (from the index on disk).
  // Libraries come as UTF-8 JSON of a LibraryMessage (library-patch.ts): main
  // passes the bytes on without reading them, and copying bytes is much
  // cheaper than copying 50k objects.
  // `moves`: track ids that changed this run (see id-moves.ts)
  load(): Promise<{ library: Uint8Array; status: ScanStatus; moves: IdMoves }>
  // the whole library now, when a patch doesn't fit the one the page has;
  // rejects when main has none, so the page keeps what it shows
  get(): Promise<Uint8Array>
  // opens the folder picker; resolves once the choice is saved
  addFolder(): Promise<void>
  // files dropped on the window: the folders among them become music folders
  addDropped(files: File[]): Promise<DropResult>
  removeFolder(path: string): void
  rescan(): void
  // rename or split artists (ticket 024); the library comes back with them
  setArtists(changes: ArtistChanges): void
  // opens a folder in the system's file manager: a music folder's path, then
  // the names below it; false when it is gone or could not be opened
  showFolder(parts: string[]): Promise<boolean>
  onChanged(listener: (library: Uint8Array) => void): () => void
  onStatus(listener: (status: ScanStatus) => void): () => void
  onIdsMoved(listener: (moves: IdMoves) => void): () => void
}

// Which API method each of its page-to-main channels carries (see PageChannels).
export interface FilesChannels {
  [LibraryChannel.load]: LibraryApi['load']
  [LibraryChannel.get]: LibraryApi['get']
  [LibraryChannel.addFolder]: LibraryApi['addFolder']
  [LibraryChannel.removeFolder]: LibraryApi['removeFolder']
  // the preload turns the page's files into paths (webUtils.getPathForFile)
  [LibraryChannel.addDropped]: (paths: string[]) => Promise<DropResult>
  [LibraryChannel.rescan]: LibraryApi['rescan']
  [LibraryChannel.setArtists]: LibraryApi['setArtists']
  [LibraryChannel.showFolder]: LibraryApi['showFolder']
}
