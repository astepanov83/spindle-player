// Music files' messages between main, the preload and its page half.
import type { IdMoves } from '../../id-moves'
import type { ScanStatus } from '../../library'
import type { ArtistChanges } from './artist-edit'
import type { SongFileInfo } from './song-info'
import type { OpenedSongs } from './loose'

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
  // the artist groups task: ask about every name again (ticket 070)
  aiRecheck: 'library:ai-recheck',
  showFolder: 'library:show-folder',
  // the song info panel (ticket 127): a song's file read now, and its file
  // or CUE sheet shown in the file manager
  songInfo: 'library:song-info',
  showSongFile: 'library:show-song-file',
  // main to page: what changed in the library (a patch, see library-patch.ts)
  changed: 'library:changed',
  // main to page: scan progress and the folder list
  status: 'library:status',
  // main to page: track ids that changed, sent before the library that has them
  idsMoved: 'library:ids-moved',
  // main to page: files or folders the system gave Spindle wait (ticket 124)
  opened: 'library:opened',
  // what the system gave, taken once
  takeOpened: 'library:take-opened',
  // songs not in the library, by their loose ids (a saved queue's)
  loose: 'library:loose',
  // a song not in the library in the system's file manager
  showFile: 'library:show-file'
} as const

// What came of a drop, or of files and folders the system gave Spindle
// (ticket 124): the folders added, how many were music folders already, how
// many were neither a folder nor a song (other files, paths that are gone),
// and the songs.
export interface DropResult {
  added: string[]
  known: number
  other: number
  // settings.json could not be read, so no folder was added
  unreadable?: true
  songs?: OpenedSongs
  // Music files is off: nothing was opened
  off?: true
}

// More paths than a person drags at once; such a list is not taken at all.
// The preload sends at most one more, so main still sees it is too many.
export const maxDropped = 1000

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
  // files dropped on the window: the folders among them become music
  // folders, the songs come back to be queued
  addDropped(files: File[]): Promise<DropResult>
  removeFolder(path: string): void
  rescan(): void
  // rename or split artists (ticket 024); the library comes back with them
  setArtists(changes: ArtistChanges): void
  // the artist groups task checks all names again, a run going is stopped first
  aiRecheck(): void
  // opens a folder in the system's file manager: a music folder's path, then
  // the names below it; false when it is gone or could not be opened
  showFolder(parts: string[]): Promise<boolean>
  // a song's file as it is now, by id; undefined when it is not in the library
  songInfo(id: string): Promise<SongFileInfo | undefined>
  // shows a song's file (or a CUE track's sheet) in its folder; false when
  // neither it nor its folder is there
  showSongFile(id: string, which: 'file' | 'sheet'): Promise<boolean>
  onChanged(listener: (library: Uint8Array) => void): () => void
  onStatus(listener: (status: ScanStatus) => void): () => void
  onIdsMoved(listener: (moves: IdMoves) => void): () => void
  // What the system gave Spindle since the last ask ("Open with", the
  // command line), oldest first; each is given once (ticket 124).
  takeOpened(): Promise<DropResult[]>
  // a call when more waits; one that came before the page listened is kept
  onOpened(listener: () => void): () => void
  // Songs not in the library, by loose id; `gone` holds those whose files
  // are gone or were never opened. Rejects when main has no answer now.
  loose(ids: string[]): Promise<OpenedSongs>
  // false when it is gone or could not be shown
  showFile(id: string): Promise<boolean>
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
  [LibraryChannel.aiRecheck]: LibraryApi['aiRecheck']
  [LibraryChannel.showFolder]: LibraryApi['showFolder']
  [LibraryChannel.songInfo]: LibraryApi['songInfo']
  [LibraryChannel.showSongFile]: LibraryApi['showSongFile']
  [LibraryChannel.takeOpened]: LibraryApi['takeOpened']
  [LibraryChannel.loose]: LibraryApi['loose']
  [LibraryChannel.showFile]: LibraryApi['showFile']
}
