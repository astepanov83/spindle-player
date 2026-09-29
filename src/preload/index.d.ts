import type {
  LibraryApi,
  PlaybackApi,
  PlaylistsApi,
  RadioApi,
  SettingsApi,
  WinApi
} from '../shared/ipc'

declare global {
  interface Window {
    win: WinApi
    settingsApi: SettingsApi
    libraryApi: LibraryApi
    playlistsApi: PlaylistsApi
    radioApi: RadioApi
    playbackApi: PlaybackApi
  }
}
