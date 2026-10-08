import type { QueueMode, Template, TemplateId } from './layout'
import { isPluginId, plugins, type PluginId } from './plugins'
import { templateIds, templates } from './templates'

export type VisualizerStyle = 'ring' | 'spectrum' | 'wave' | 'off'
export type ThemeChoice = 'system' | 'dark' | 'light'
export type CoverSource = 'musicbrainz' | 'deezer' | 'itunes'
export type CloseAction = 'ask' | 'minimize' | 'quit'
// the Artists view: artists with an album of their own, or every artist
export type ArtistsShown = 'album' | 'all'
// Even out loudness with ReplayGain (ticket 090): off, each song by its own
// gain, or by its album's gain while the album plays in order
export type Loudness = 'off' | 'song' | 'album'
// How each library view is drawn (ticket 095), picked in its title row
export interface ViewLooks {
  albums: 'grid' | 'list'
  artists: 'grid' | 'shelves' | 'list'
  artistPage: 'sections' | 'albums' | 'column'
}
export type LookView = keyof ViewLooks
// what an album, artist or station with no picture shows (ticket 103)
export type NoCover = 'record' | 'rings' | 'type'

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
  // which plugins are on; MFP off means the site is never asked
  plugins: Record<PluginId, boolean>
  // a list view's sort, by view: { albums: 'added' } (ticket 085). The view's
  // plugin knows the values; a view left out is in its own order.
  viewSorts: Record<string, string>
  artistsShown: ArtistsShown
  viewLooks: ViewLooks
  loudness: Loudness
  noCover: NoCover
}

export interface Size {
  width: number
  height: number
}

// Where the window was when the app closed: its top-left corner (of the
// normal size when maximized). Whether it was maximized is per template.
export interface WindowPlace {
  x: number
  y: number
}

// The AI service's choices (spec "AI models"). Main's own: the page gets
// AiState instead. Keys are never here, they are in main/ai/secrets.ts.
export interface AiSettings {
  // the chosen provider's id
  provider: string
  // task id -> on; a task left out is off
  tasks: Record<string, boolean>
  // each provider's plain settings, e.g. { model: 'auto' }
  providers: Record<string, Record<string, string>>
}

// What the settings file holds. Window sizes are main's business, so the page never sees them.
export interface StoredSettings extends Settings {
  // the last size the user chose per template; missing means the template's own size
  windowSizes: Partial<Record<TemplateId, Size>>
  // whether each template was left maximized; missing means not
  windowMaximized: Partial<Record<TemplateId, boolean>>
  // none until the window was first closed or moved; then it opens there again
  windowPlace: WindowPlace | null
  // music folders, absolute paths. Only main changes them: through the folder
  // picker, or a folder dropped on the window (checked in main/plugins/files/dropped.ts).
  folders: string[]
  ai: AiSettings
}

export const visualizerStyles: VisualizerStyle[] = ['ring', 'spectrum', 'wave', 'off']
export const themeChoices: ThemeChoice[] = ['dark', 'light', 'system']
// also the order they are tried in, after the MusicBrainz id lookup
export const coverSources: CoverSource[] = ['musicbrainz', 'deezer', 'itunes']
export const closeActions: CloseAction[] = ['ask', 'minimize', 'quit']
export const artistsShownChoices: ArtistsShown[] = ['album', 'all']
export const loudnessChoices: Loudness[] = ['off', 'song', 'album']
export const noCoverChoices: NoCover[] = ['record', 'rings', 'type']
// Styles taken out on 2026-10-09: still known in a file, so it is not copied
// aside at start, and read as the default.
const droppedNoCover = ['sound', 'genre']
// each view's looks, the default first
export const viewLookChoices: { [V in LookView]: ViewLooks[V][] } = {
  albums: ['grid', 'list'],
  artists: ['grid', 'shelves', 'list'],
  artistPage: ['sections', 'albums', 'column']
}
export const lookViews = Object.keys(viewLookChoices) as LookView[]

export const isViewLook = <V extends LookView>(view: V, v: unknown): v is ViewLooks[V] =>
  (viewLookChoices[view] as unknown[]).includes(v)

function pluginDefaults(): Record<PluginId, boolean> {
  return Object.fromEntries(plugins.map((p) => [p.id, p.defaultOn])) as Record<PluginId, boolean>
}

export function defaultSettings(): Settings {
  return {
    template: 'studio',
    queue: { studio: 'tab', classic: 'drawer', focus: 'tab' },
    visualizer: 'ring',
    theme: 'system',
    volume: 70,
    fetchCovers: true,
    coverSources: { musicbrainz: true, deezer: true, itunes: true },
    closeAction: 'ask',
    plugins: pluginDefaults(),
    viewSorts: {},
    artistsShown: 'album',
    viewLooks: { albums: 'grid', artists: 'grid', artistPage: 'sections' },
    loudness: 'album',
    noCover: 'rings'
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

// An old file also has `maximized` here, one for all templates. It is read
// into windowMaximized instead (parseStoredSettings).
export function parseWindowPlace(v: unknown): WindowPlace | null {
  if (!isObject(v)) return null
  const { x, y, maximized } = v
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (maximized !== undefined && typeof maximized !== 'boolean') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const clamp = (n: number): number => Math.min(maxPos, Math.max(-maxPos, Math.round(n)))
  return { x: clamp(x), y: clamp(y) }
}

function parseMaximized(v: unknown): StoredSettings['windowMaximized'] {
  const r = isObject(v) ? v : {}
  const out: StoredSettings['windowMaximized'] = {}
  for (const id of templateIds) if (typeof r[id] === 'boolean') out[id] = r[id]
  return out
}

// Before windowMaximized, one flag in windowPlace said the window was maximized.
// It goes to the template the app was in.
function oldMaximized(
  r: Record<string, unknown>,
  template: TemplateId,
  base: StoredSettings['windowMaximized']
): StoredSettings['windowMaximized'] {
  const old = isObject(r.windowPlace) && r.windowPlace.maximized === true
  return old ? { ...base, [template]: true } : { ...base }
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

// A plugin's old top-level switch (`oldSwitch` in the plugin list, as MFP's
// `mfp`) is read only when `plugins` is missing.
function parsePlugins(
  v: unknown,
  raw: Record<string, unknown>,
  base: Record<PluginId, boolean>
): Record<PluginId, boolean> {
  const out = { ...base }
  if (!isObject(v)) {
    for (const p of plugins) {
      const old = p.oldSwitch && raw[p.oldSwitch]
      if (typeof old === 'boolean') out[p.id] = old
    }
    return out
  }
  for (const p of plugins) if (typeof v[p.id] === 'boolean') out[p.id] = v[p.id] as boolean
  return out
}

// A view id or a sort: a short word, so a bad file can't hold much here.
const isSortWord = (v: unknown): v is string => typeof v === 'string' && /^[a-z-]{1,40}$/.test(v)

function parseViewSorts(v: unknown, base: Record<string, string>): Record<string, string> {
  if (!isObject(v)) return { ...base }
  const out: Record<string, string> = {}
  for (const [k, x] of Object.entries(v)) if (isSortWord(k) && isSortWord(x)) out[k] = x
  return out
}

// Each view on its own: a look this version doesn't have keeps the base's.
function parseViewLooks(v: unknown, base: ViewLooks): ViewLooks {
  const r = isObject(v) ? v : {}
  return {
    albums: isViewLook('albums', r.albums) ? r.albums : base.albums,
    artists: isViewLook('artists', r.artists) ? r.artists : base.artists,
    artistPage: isViewLook('artistPage', r.artistPage) ? r.artistPage : base.artistPage
  }
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

export function defaultAiSettings(): AiSettings {
  return { provider: 'openrouter', tasks: {}, providers: {} }
}

// Each field on its own, and each entry of tasks and providers on its own.
function parseAi(v: unknown, base: AiSettings): AiSettings {
  if (!isObject(v)) return structuredClone(base)
  const provider = typeof v.provider === 'string' && v.provider ? v.provider : base.provider
  const tasks: Record<string, boolean> = {}
  if (isObject(v.tasks)) {
    for (const [k, on] of Object.entries(v.tasks)) if (typeof on === 'boolean') tasks[k] = on
  } else Object.assign(tasks, base.tasks)
  const providers: Record<string, Record<string, string>> = {}
  if (isObject(v.providers)) {
    for (const [id, values] of Object.entries(v.providers)) {
      if (!isObject(values)) continue
      providers[id] = {}
      for (const [k, x] of Object.entries(values)) if (typeof x === 'string') providers[id][k] = x
    }
  } else Object.assign(providers, structuredClone(base.providers))
  return { provider, tasks, providers }
}

function isKnownAi(v: unknown): boolean {
  if (!isObject(v)) return false
  if (Object.keys(v).some((k) => !['provider', 'tasks', 'providers'].includes(k))) return false
  if (v.provider !== undefined && (typeof v.provider !== 'string' || !v.provider)) return false
  if (
    v.tasks !== undefined &&
    (!isObject(v.tasks) || Object.values(v.tasks).some((on) => typeof on !== 'boolean'))
  )
    return false
  if (v.providers === undefined) return true
  return (
    isObject(v.providers) &&
    Object.values(v.providers).every(
      (values) => isObject(values) && Object.values(values).every((x) => typeof x === 'string')
    )
  )
}

export function defaultStoredSettings(): StoredSettings {
  return {
    ...defaultSettings(),
    windowSizes: {},
    windowMaximized: {},
    windowPlace: null,
    folders: [],
    ai: defaultAiSettings()
  }
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

  const template = oneOf(r.template, templateIds, base.template)
  return {
    template,
    queue,
    visualizer: oneOf(r.visualizer, visualizerStyles, base.visualizer),
    theme: oneOf(r.theme, themeChoices, base.theme),
    volume: parseVolume(r.volume, base.volume),
    fetchCovers: typeof r.fetchCovers === 'boolean' ? r.fetchCovers : base.fetchCovers,
    coverSources: parseCoverSources(r.coverSources, base.coverSources),
    closeAction: oneOf(r.closeAction, closeActions, base.closeAction),
    plugins: parsePlugins(r.plugins, r, base.plugins),
    viewSorts: parseViewSorts(r.viewSorts, base.viewSorts),
    artistsShown: oneOf(r.artistsShown, artistsShownChoices, base.artistsShown),
    viewLooks: parseViewLooks(r.viewLooks, base.viewLooks),
    loudness: oneOf(r.loudness, loudnessChoices, base.loudness),
    noCover: oneOf(r.noCover, noCoverChoices, base.noCover),
    windowSizes,
    windowMaximized:
      r.windowMaximized === undefined
        ? oldMaximized(r, template, base.windowMaximized)
        : parseMaximized(r.windowMaximized),
    windowPlace: r.windowPlace === undefined ? base.windowPlace : parseWindowPlace(r.windowPlace),
    folders: Array.isArray(r.folders) ? parseFolders(r.folders) : [...base.folders],
    ai: parseAi(r.ai, base.ai)
  }
}

// The plugins' old switches: still read, and dropped by the next save
const oldSwitches = plugins.flatMap((p) => p.oldSwitch ?? [])
const storedKeys = [...Object.keys(defaultStoredSettings()), ...oldSwitches]

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

// Kept as it is: whole numbers in range and no other fields. The old
// `maximized` is fine, as it is read into windowMaximized.
function isKnownPlace(v: unknown): boolean {
  const parsed = parseWindowPlace(v)
  return (
    !!parsed &&
    isObject(v) &&
    Object.keys(v).every((k) => ['x', 'y', 'maximized'].includes(k)) &&
    parsed.x === v.x &&
    parsed.y === v.y
  )
}

function isKnownMaximized(v: unknown): boolean {
  if (!isObject(v)) return false
  return Object.entries(v).every(
    ([id, on]) => templateIds.includes(id as TemplateId) && typeof on === 'boolean'
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
  if (has('windowMaximized') && !isKnownMaximized(raw.windowMaximized)) return false
  if (has('fetchCovers') && typeof raw.fetchCovers !== 'boolean') return false
  if (oldSwitches.some((k) => has(k) && typeof raw[k] !== 'boolean')) return false
  if (
    has('plugins') &&
    (!isObject(raw.plugins) ||
      Object.entries(raw.plugins).some(([k, v]) => !isPluginId(k) || typeof v !== 'boolean'))
  )
    return false
  if (has('closeAction') && !closeActions.includes(raw.closeAction as CloseAction)) return false
  if (has('artistsShown') && !artistsShownChoices.includes(raw.artistsShown as ArtistsShown))
    return false
  if (
    has('viewLooks') &&
    (!isObject(raw.viewLooks) ||
      Object.entries(raw.viewLooks).some(
        ([k, v]) => !lookViews.includes(k as LookView) || !isViewLook(k as LookView, v)
      ))
  )
    return false
  if (has('loudness') && !loudnessChoices.includes(raw.loudness as Loudness)) return false
  if (has('noCover') && ![...noCoverChoices, ...droppedNoCover].includes(raw.noCover as string))
    return false
  if (
    has('coverSources') &&
    (!isObject(raw.coverSources) ||
      Object.entries(raw.coverSources).some(
        ([k, v]) => !coverSources.includes(k as CoverSource) || typeof v !== 'boolean'
      ))
  )
    return false
  if (has('ai') && !isKnownAi(raw.ai)) return false
  if (
    has('viewSorts') &&
    (!isObject(raw.viewSorts) ||
      Object.entries(raw.viewSorts).some(([k, v]) => !isSortWord(k) || !isSortWord(v)))
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
    closeAction: s.closeAction,
    plugins: { ...s.plugins },
    viewSorts: { ...s.viewSorts },
    artistsShown: s.artistsShown,
    viewLooks: { ...s.viewLooks },
    loudness: s.loudness,
    noCover: s.noCover
  }
}
