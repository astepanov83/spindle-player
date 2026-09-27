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
