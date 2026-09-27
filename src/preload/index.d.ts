import type { SettingsApi, WinApi } from '../shared/ipc'

declare global {
  interface Window {
    win: WinApi
    settingsApi: SettingsApi
  }
}
