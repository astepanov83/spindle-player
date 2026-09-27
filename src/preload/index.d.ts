import type { LibraryApi, SettingsApi, WinApi } from '../shared/ipc'

declare global {
  interface Window {
    win: WinApi
    settingsApi: SettingsApi
    libraryApi: LibraryApi
  }
}
