import type { QueueMode, Template, TemplateId } from './layout'
import { templateIds, templates } from './templates'

export type VisualizerStyle = 'ring' | 'spectrum' | 'wave' | 'off'
export type ThemeChoice = 'system' | 'dark' | 'light'
export type CoverSource = 'musicbrainz' | 'deezer' | 'itunes'
export type CloseAction = 'ask' | 'minimize' | 'quit'

export interface Settings {
  template: TemplateId
  // per template, so each keeps its own choice
  queue: Record<TemplateId, QueueMode>
  visualizer: VisualizerStyle
  theme: ThemeChoice
  // 0..100, as the slider shows it
  volume: number
  // look up covers online for albums with none; off, nothing is sent anywhere
  fetchCovers: boolean
  coverSources: Record<CoverSource, boolean>
  // what closing the window does; 'ask' until the user picks one
  closeAction: CloseAction
}

export interface Size {
  width: number
  height: number
}

// Where the window was when the app closed: its top-left corner (of the
// normal size when maximized), and whether it was maximized.
export interface WindowPlace {
  x: number
  y: number
  maximized: boolean
}

// What the settings file holds. Window sizes are main's business, so the page never sees them.
export interface StoredSettings extends Settings {
  // the last size the user chose per template; missing means the template's own size
  windowSizes: Partial<Record<TemplateId, Size>>
  // none until the window was first closed or moved; then it opens there again
  windowPlace: WindowPlace | null
  // music folders, absolute paths. Only main changes them: through the folder
  // picker, or a folder dropped on the window (checked in main/library/dropped.ts).
  folders: string[]
}

export const visualizerStyles: VisualizerStyle[] = ['ring', 'spectrum', 'wave', 'off']
export const themeChoices: ThemeChoice[] = ['dark', 'light', 'system']
// also the order they are tried in, after the MusicBrainz id lookup
export const coverSources: CoverSource[] = ['musicbrainz', 'deezer', 'itunes']
export const closeActions: CloseAction[] = ['ask', 'minimize', 'quit']

export function defaultSettings(): Settings {
  return {
    template: 'studio',
    queue: { studio: 'tab', classic: 'drawer', focus: 'tab' },
    visualizer: 'ring',
    theme: 'system',
    volume: 70,
    fetchCovers: false,
    coverSources: { musicbrainz: true, deezer: true, itunes: true },
    closeAction: 'ask'
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

// Also what main stores: a size the window manager gave below the template's
// minimum (a tiling one may) is saved as the minimum, so the file reads back as is.
export function parseSize(v: unknown, template: Template): Size | undefined {
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

// Past any screen's corner, so a broken number can't place the window far away.
const maxPos = 100000

export function parseWindowPlace(v: unknown): WindowPlace | null {
  if (!isObject(v)) return null
  const { x, y, maximized } = v
  if (typeof x !== 'number' || typeof y !== 'number' || typeof maximized !== 'boolean') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const clamp = (n: number): number => Math.min(maxPos, Math.max(-maxPos, Math.round(n)))
  return { x: clamp(x), y: clamp(y), maximized }
}

function parseVolume(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(100, Math.max(0, Math.round(v)))
}

function parseCoverSources(
  v: unknown,
  base: Record<CoverSource, boolean>
): Record<CoverSource, boolean> {
  const r = isObject(v) ? v : {}
  const out = { ...base }
  for (const s of coverSources) if (typeof r[s] === 'boolean') out[s] = r[s]
  return out
}

// Absolute on Linux and macOS, or with a drive letter on Windows.
function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')
}

// Keeps absolute paths only, without a trailing slash, each once.
export function parseFolders(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const f of v) {
    if (typeof f !== 'string' || !isAbsolutePath(f)) continue
    const p = f.length > 1 ? f.replace(/[\\/]+$/, '') || f.slice(0, 1) : f
    if (!out.includes(p)) out.push(p)
  }
  return out
}

export function defaultStoredSettings(): StoredSettings {
  return { ...defaultSettings(), windowSizes: {}, windowPlace: null, folders: [] }
}

// The file may be old, hand-edited or half written, and a message from the page
// may be wrong too. Every field that is wrong falls back to the same field of
// `base` on its own, so one bad value doesn't reset the rest.
export function parseStoredSettings(
  raw: unknown,
  base: StoredSettings = defaultStoredSettings()
): StoredSettings {
  const r = isObject(raw) ? raw : {}
  const rawQueue = isObject(r.queue) ? r.queue : {}
  const rawSizes = isObject(r.windowSizes) ? r.windowSizes : undefined

  const queue = { ...base.queue }
  const windowSizes: StoredSettings['windowSizes'] = rawSizes ? {} : { ...base.windowSizes }
  for (const id of templateIds) {
    const t = templates[id]
    queue[id] = oneOf(rawQueue[id], t.queueOptions, base.queue[id])
    const size = rawSizes && parseSize(rawSizes[id], t)
    if (size) windowSizes[id] = size
  }

  return {
    template: oneOf(r.template, templateIds, base.template),
    queue,
    visualizer: oneOf(r.visualizer, visualizerStyles, base.visualizer),
    theme: oneOf(r.theme, themeChoices, base.theme),
    volume: parseVolume(r.volume, base.volume),
    fetchCovers: typeof r.fetchCovers === 'boolean' ? r.fetchCovers : base.fetchCovers,
    coverSources: parseCoverSources(r.coverSources, base.coverSources),
    closeAction: oneOf(r.closeAction, closeActions, base.closeAction),
    windowSizes,
    windowPlace: r.windowPlace === undefined ? base.windowPlace : parseWindowPlace(r.windowPlace),
    folders: Array.isArray(r.folders) ? parseFolders(r.folders) : [...base.folders]
  }
}

const storedKeys = Object.keys(defaultStoredSettings())

// Every template named is one this version has, with a mode it offers. A
// template left out is fine: the save only adds it.
function isKnownQueue(v: unknown): boolean {
  if (!isObject(v)) return false
  return Object.entries(v).every(
    ([id, mode]) =>
      templateIds.includes(id as TemplateId) &&
      templates[id as TemplateId].queueOptions.includes(mode as QueueMode)
  )
}

// Every size is for a known template and is kept as it is (not cut to the
// template's minimum or the largest side, not rounded, no other fields).
function isKnownSizes(v: unknown): boolean {
  if (!isObject(v)) return false
  return Object.entries(v).every(([id, size]) => {
    if (!templateIds.includes(id as TemplateId) || !isObject(size)) return false
    const parsed = parseSize(size, templates[id as TemplateId])
    return (
      !!parsed &&
      Object.keys(size).length === 2 &&
      parsed.width === size.width &&
      parsed.height === size.height
    )
  })
}

// Kept as it is: whole numbers in range and no other fields.
function isKnownPlace(v: unknown): boolean {
  const parsed = parseWindowPlace(v)
  return (
    !!parsed && isObject(v) && Object.keys(v).length === 3 && parsed.x === v.x && parsed.y === v.y
  )
}

// True when every field the file has is one this version reads as it is.
// Otherwise the next save would drop something, so the file is copied first.
export function isKnownSettingsFile(raw: unknown): boolean {
  if (!isObject(raw)) return false
  // a field from a newer version would be dropped by the next save
  if (Object.keys(raw).some((k) => !storedKeys.includes(k))) return false
  const has = (k: string): boolean => raw[k] !== undefined
  if (has('template') && !templateIds.includes(raw.template as TemplateId)) return false
  if (has('visualizer') && !visualizerStyles.includes(raw.visualizer as VisualizerStyle))
    return false
  if (has('theme') && !themeChoices.includes(raw.theme as ThemeChoice)) return false
  if (has('volume') && parseVolume(raw.volume, NaN) !== raw.volume) return false
  if (has('queue') && !isKnownQueue(raw.queue)) return false
  if (has('windowSizes') && !isKnownSizes(raw.windowSizes)) return false
  if (has('windowPlace') && raw.windowPlace !== null && !isKnownPlace(raw.windowPlace)) return false
  if (has('fetchCovers') && typeof raw.fetchCovers !== 'boolean') return false
  if (has('closeAction') && !closeActions.includes(raw.closeAction as CloseAction)) return false
  if (
    has('coverSources') &&
    (!isObject(raw.coverSources) ||
      Object.entries(raw.coverSources).some(
        ([k, v]) => !coverSources.includes(k as CoverSource) || typeof v !== 'boolean'
      ))
  )
    return false
  if (has('folders')) {
    if (!Array.isArray(raw.folders)) return false
    if (parseFolders(raw.folders).length !== new Set(raw.folders).size) return false
  }
  return true
}

// The part of the stored settings the page gets.
export function pageSettings(s: StoredSettings): Settings {
  return {
    template: s.template,
    queue: { ...s.queue },
    visualizer: s.visualizer,
    theme: s.theme,
    volume: s.volume,
    fetchCovers: s.fetchCovers,
    coverSources: { ...s.coverSources },
    closeAction: s.closeAction
  }
}
