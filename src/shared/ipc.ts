import type { ScanStatus } from './library'
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
