// Main loads the settings file. main.ts fills this in before the app mounts,
// and App.svelte sends every change back.
import { defaultSettings, type Settings } from '../../../shared/settings'

export const settings: Settings = $state(defaultSettings())

export function loadSettings(saved: Settings): void {
  Object.assign(settings, saved)
}
