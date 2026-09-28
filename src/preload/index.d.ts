import type { LibraryApi, PlaybackApi, PlaylistsApi, SettingsApi, WinApi } from '../shared/ipc'

declare global {
  interface Window {
    win: WinApi
    settingsApi: SettingsApi
    libraryApi: LibraryApi
    playlistsApi: PlaylistsApi
    playbackApi: PlaybackApi
  }
}
