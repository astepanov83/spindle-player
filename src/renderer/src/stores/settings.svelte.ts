// Main loads the settings file. main.ts fills this in before the app mounts,
// and App.svelte sends every change back.
import { defaultSettings, type Settings } from '../../../shared/settings'

export const settings: Settings = $state(defaultSettings())

// false when main could not give the settings: the page runs on defaults and
// doesn't send them, so they can't replace the user's file
export const settingsState = { canSave: true }

export function loadSettings(saved: Settings, ok = true): void {
  Object.assign(settings, saved)
  settingsState.canSave = ok
}
