// Main loads the settings file. main.ts fills this in before the app mounts,
// and App.svelte sends every change back.
import type { PluginId } from '../../../shared/plugins'
import {
  defaultSettings,
  isViewLook,
  type LookView,
  type Settings,
  type ViewLooks
} from '../../../shared/settings'

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

// How a library view is drawn now (ticket 095). The page builders branch on
// it; a look not built yet draws as the view's first one.
export function viewLook<V extends LookView>(view: V): ViewLooks[V] {
  return settings.viewLooks[view]
}

// From the title row's switch or Settings; a value the view doesn't have changes nothing.
export function setViewLook(view: LookView, look: unknown): void {
  if (!isViewLook(view, look) || settings.viewLooks[view] === look) return
  settings.viewLooks = { ...settings.viewLooks, [view]: look }
}
