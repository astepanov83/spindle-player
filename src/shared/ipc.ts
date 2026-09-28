import type { ScanStatus } from './library'
import type { Playlist } from './playlists'
import type { QueuePlace, SavedQueue } from './saved-queue'
import type { Settings } from './settings'

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
  save(settings: Settings): void
}

export const LibraryChannel = {
  load: 'library:load',
  addFolder: 'library:add-folder',
  removeFolder: 'library:remove-folder',
  rescan: 'library:rescan',
  // main to page: a new library after a scan changed something
  changed: 'library:changed',
  // main to page: scan progress and the folder list
  status: 'library:status'
} as const

// What the preload exposes to the page as `window.libraryApi`.
// Main owns the folder list and the index; the page only asks.
export interface LibraryApi {
  // The library as it was when the page loaded (from the index on disk).
  // Libraries come as UTF-8 JSON of LibraryData: main passes the bytes on without
  // reading them, and copying bytes is much cheaper than copying 50k objects.
  load(): Promise<{ library: Uint8Array; status: ScanStatus }>
  // opens the folder picker; resolves once the choice is saved
  addFolder(): Promise<void>
  removeFolder(path: string): void
  rescan(): void
  onChanged(listener: (library: Uint8Array) => void): () => void
  onStatus(listener: (status: ScanStatus) => void): () => void
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
  // a song that would not play, written to main's log
  log(text: string): void
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
  [LibraryChannel.addFolder]: LibraryApi['addFolder']
  [LibraryChannel.removeFolder]: LibraryApi['removeFolder']
  [LibraryChannel.rescan]: LibraryApi['rescan']
  [PlaylistChannel.load]: PlaylistsApi['load']
  [PlaylistChannel.save]: PlaylistsApi['save']
  [PlaybackChannel.loadQueue]: PlaybackApi['loadQueue']
  [PlaybackChannel.saveQueue]: PlaybackApi['saveQueue']
  [PlaybackChannel.savePlace]: PlaybackApi['savePlace']
  [PlaybackChannel.log]: PlaybackApi['log']
}

// Channels that answer (ipcRenderer.invoke) and channels that only send.
export type InvokeChannel = {
  [K in keyof PageChannels]: ReturnType<PageChannels[K]> extends Promise<unknown> ? K : never
}[keyof PageChannels]
export type SendChannel = Exclude<keyof PageChannels, InvokeChannel>
