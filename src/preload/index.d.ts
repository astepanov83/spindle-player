import type { AiApi, PlaybackApi, PlaylistsApi, SettingsApi, WinApi } from '../shared/ipc'
import type { PluginApis } from '../shared/plugins'

// The core's APIs, and the plugins' from the plugin list.
declare global {
  interface Window extends PluginApis {
    win: WinApi
    aiApi: AiApi
    settingsApi: SettingsApi
    playlistsApi: PlaylistsApi
    playbackApi: PlaybackApi
  }
}
