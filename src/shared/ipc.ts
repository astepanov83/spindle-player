import type { ArtistChanges } from './artist-overrides'
import type { IdMoves } from './id-moves'
import type { ScanStatus } from './library'
import type { Playlist } from './playlists'
import type { QueuePlace, SavedQueue } from './saved-queue'
import type { Settings } from './settings'
import type { HistoryEntry, Station } from './stations'

// Channel names used by both main and preload, so a typo is a type error.
export const WinChannel = {
  minimize: 'win:minimize',
  toggleMaximize: 'win:toggle-maximize',
  close: 'win:close',
  isMaximized: 'win:is-maximized',
  maximized: 'win:maximized'
} as const

export const SettingsChannel = {
  load: 'settings:load',
  save: 'settings:save'
} as const

// What the preload exposes to the page as `window.win`.
export interface WinApi {
  minimize(): void
  toggleMaximize(): void
  close(): void
  isMaximized(): Promise<boolean>
  // Returns a function that stops listening.
  onMaximized(listener: (maximized: boolean) => void): () => void
}

// What the preload exposes to the page as `window.settingsApi`.
// Main applies what changed: the window size for a new template, the theme.
export interface SettingsApi {
  // the settings as they were when the page loaded
  load(): Promise<Settings>
  // toFile false: the page could not load them, so main applies them to the
  // window but doesn't save them over the user's file
  save(settings: Settings, toFile: boolean): void
}

export const LibraryChannel = {
  load: 'library:load',
  // the whole library now, for a page that missed a patch
  get: 'library:get',
  addFolder: 'library:add-folder',
  removeFolder: 'library:remove-folder',
  rescan: 'library:rescan',
  setArtists: 'library:set-artists',
  // main to page: what changed in the library (a patch, see library-patch.ts)
  changed: 'library:changed',
  // main to page: scan progress and the folder list
  status: 'library:status',
  // main to page: track ids that changed, sent before the library that has them
  idsMoved: 'library:ids-moved'
} as const

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
  removeFolder(path: string): void
  rescan(): void
  // rename or split artists (ticket 024); the library comes back with them
  setArtists(changes: ArtistChanges): void
  onChanged(listener: (library: Uint8Array) => void): () => void
  onStatus(listener: (status: ScanStatus) => void): () => void
  onIdsMoved(listener: (moves: IdMoves) => void): () => void
}

export const PlaylistChannel = {
  load: 'playlists:load',
  save: 'playlists:save'
} as const

// What the preload exposes to the page as `window.playlistsApi`.
// The page edits the list and sends all of it; main checks it and saves it.
export interface PlaylistsApi {
  load(): Promise<Playlist[]>
  save(playlists: Playlist[]): void
}

export const PlaybackChannel = {
  loadQueue: 'queue:load',
  saveQueue: 'queue:save',
  savePlace: 'queue:save-place',
  playing: 'playback:playing',
  log: 'playback:log'
} as const

// What the preload exposes to the page as `window.playbackApi`.
export interface PlaybackApi {
  // the queue and position from the last run
  loadQueue(): Promise<SavedQueue>
  // the whole list; sent only when the list changes
  saveQueue(queue: SavedQueue): void
  // the current song and seconds into it; sent on every song change and while playing
  savePlace(place: QueuePlace): void
  // play or pause; while a song plays, the library scan slows down
  playing(playing: boolean): void
  // a song that would not play, written to main's log
  log(text: string): void
}

export const RadioChannel = {
  stations: 'radio:stations',
  save: 'radio:save',
  remove: 'radio:remove',
  move: 'radio:move',
  choose: 'radio:choose',
  history: 'radio:history'
} as const

// What the preload exposes to the page as `window.radioApi`.
// Main owns My stations and checks every change; each one answers with the list as it is now.
export interface RadioApi {
  stations(): Promise<Station[]>
  // a new station goes to the end; a known one is replaced where it is
  save(station: Station): Promise<Station[]>
  remove(id: string): Promise<Station[]>
  // one place up (-1) or down (1)
  move(id: string, by: -1 | 1): Promise<Station[]>
  // the stream url the user picked for the station
  choose(id: string, url: string): Promise<Station[]>
  // the last 50 titles, oldest first
  history(id: string): Promise<HistoryEntry[]>
}

// Which API method each page-to-main channel carries. The preload's calls and
// main's handlers are both typed from this, so a change on one side and not
// the other is a type error.
export interface PageChannels {
  [WinChannel.minimize]: WinApi['minimize']
  [WinChannel.toggleMaximize]: WinApi['toggleMaximize']
  [WinChannel.close]: WinApi['close']
  [WinChannel.isMaximized]: WinApi['isMaximized']
  [SettingsChannel.load]: SettingsApi['load']
  [SettingsChannel.save]: SettingsApi['save']
  [LibraryChannel.load]: LibraryApi['load']
  [LibraryChannel.get]: LibraryApi['get']
  [LibraryChannel.addFolder]: LibraryApi['addFolder']
  [LibraryChannel.removeFolder]: LibraryApi['removeFolder']
  [LibraryChannel.rescan]: LibraryApi['rescan']
  [LibraryChannel.setArtists]: LibraryApi['setArtists']
  [PlaylistChannel.load]: PlaylistsApi['load']
  [PlaylistChannel.save]: PlaylistsApi['save']
  [RadioChannel.stations]: RadioApi['stations']
  [RadioChannel.save]: RadioApi['save']
  [RadioChannel.remove]: RadioApi['remove']
  [RadioChannel.move]: RadioApi['move']
  [RadioChannel.choose]: RadioApi['choose']
  [RadioChannel.history]: RadioApi['history']
  [PlaybackChannel.loadQueue]: PlaybackApi['loadQueue']
  [PlaybackChannel.saveQueue]: PlaybackApi['saveQueue']
  [PlaybackChannel.savePlace]: PlaybackApi['savePlace']
  [PlaybackChannel.playing]: PlaybackApi['playing']
  [PlaybackChannel.log]: PlaybackApi['log']
}

// Channels that answer (ipcRenderer.invoke) and channels that only send.
export type InvokeChannel = {
  [K in keyof PageChannels]: ReturnType<PageChannels[K]> extends Promise<unknown> ? K : never
}[keyof PageChannels]
export type SendChannel = Exclude<keyof PageChannels, InvokeChannel>
