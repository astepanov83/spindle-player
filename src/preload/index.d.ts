import type { PlaybackApi, PlaylistsApi, SettingsApi, WinApi } from '../shared/ipc'

// The core's APIs. Each plugin declares its own next to its page half (window.d.ts).
declare global {
  interface Window {
    win: WinApi
    settingsApi: SettingsApi
    playlistsApi: PlaylistsApi
    playbackApi: PlaybackApi
  }
}
