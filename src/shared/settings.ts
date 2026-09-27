import type { QueueMode, Template, TemplateId } from './layout'
import { templateIds, templates } from './templates'

export type VisualizerStyle = 'ring' | 'spectrum' | 'wave' | 'off'
export type ThemeChoice = 'system' | 'dark' | 'light'

export interface Settings {
  template: TemplateId
  // per template, so each keeps its own choice
  queue: Record<TemplateId, QueueMode>
  visualizer: VisualizerStyle
  theme: ThemeChoice
}

export interface Size {
  width: number
  height: number
}

// What the settings file holds. Window sizes are main's business, so the page never sees them.
export interface StoredSettings extends Settings {
  // the last size the user chose per template; missing means the template's own size
  windowSizes: Partial<Record<TemplateId, Size>>
}

export const visualizerStyles: VisualizerStyle[] = ['ring', 'spectrum', 'wave', 'off']
export const themeChoices: ThemeChoice[] = ['dark', 'light', 'system']

export function defaultSettings(): Settings {
  return {
    template: 'studio',
    queue: { studio: 'tab', classic: 'drawer', focus: 'tab' },
    visualizer: 'ring',
    theme: 'system'
  }
}

// A saved choice the template does not offer falls back to its first option.
export function queueModeFor(template: Template, saved: QueueMode | undefined): QueueMode {
  return saved && template.queueOptions.includes(saved) ? saved : template.queueOptions[0]
}

// Larger than any screen, so a broken number can't make a huge window.
const maxSide = 16384

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

function parseSize(v: unknown, template: Template): Size | undefined {
  if (!isObject(v)) return undefined
  const { width, height } = v
  if (typeof width !== 'number' || typeof height !== 'number') return undefined
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined
  const clamp = (n: number, min: number): number => Math.min(maxSide, Math.max(min, Math.round(n)))
  return {
    width: clamp(width, template.window.minWidth),
    height: clamp(height, template.window.minHeight)
  }
}

// The file may be old, hand-edited or half written. Every field that is wrong
// falls back to its default on its own, so one bad value doesn't reset the rest.
export function parseStoredSettings(raw: unknown): StoredSettings {
  const d = defaultSettings()
  const r = isObject(raw) ? raw : {}
  const rawQueue = isObject(r.queue) ? r.queue : {}
  const rawSizes = isObject(r.windowSizes) ? r.windowSizes : {}

  const queue = { ...d.queue }
  const windowSizes: StoredSettings['windowSizes'] = {}
  for (const id of templateIds) {
    const t = templates[id]
    queue[id] = oneOf(rawQueue[id], t.queueOptions, d.queue[id])
    const size = parseSize(rawSizes[id], t)
    if (size) windowSizes[id] = size
  }

  return {
    template: oneOf(r.template, templateIds, d.template),
    queue,
    visualizer: oneOf(r.visualizer, visualizerStyles, d.visualizer),
    theme: oneOf(r.theme, themeChoices, d.theme),
    windowSizes
  }
}

// The part of the stored settings the page gets.
export function pageSettings(s: StoredSettings): Settings {
  return { template: s.template, queue: { ...s.queue }, visualizer: s.visualizer, theme: s.theme }
}
