// Main loads the settings file. main.ts fills this in before the app mounts,
// and App.svelte sends every change back.
import type { PluginId } from '../../../shared/plugins'
import { defaultSettings, type Settings } from '../../../shared/settings'

export const settings: Settings = $state(defaultSettings())

// false when main could not give the settings: the page runs on defaults and
// doesn't send them, so they can't replace the user's file
export const settingsState = { canSave: true }

export function loadSettings(saved: Settings, ok = true): void {
  Object.assign(settings, saved)
  settingsState.canSave = ok
}

export function pluginOn(id: PluginId): boolean {
  return settings.plugins[id]
}

// A list view's saved sort; the view's plugin checks the value.
export function viewSort(view: string): string | undefined {
  return settings.viewSorts[view]
}

export function setViewSort(view: string, sort: string): void {
  settings.viewSorts = { ...settings.viewSorts, [view]: sort }
}
