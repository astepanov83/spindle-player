// Main owns the settings file. The page gets a copy at start and sends back each change.
import { join } from 'path'
import { app } from 'electron'
import type { TemplateId } from '../shared/layout'
import { templates } from '../shared/templates'
import {
  isKnownSettingsFile,
  pageSettings,
  parseSize,
  parseFolders,
  parseWindowPlace,
  parseStoredSettings,
  type Settings,
  type Size,
  type StoredSettings,
  type WindowPlace
} from '../shared/settings'
import { JsonFileWriter, openJsonFile, removeStrayTmp } from './json-file'

export class SettingsStore {
  #data: StoredSettings
  // none when the file could not be read: it may still be fine, so it is never replaced
  #writer: JsonFileWriter<StoredSettings> | undefined
  // false when the folder list on disk is unknown, so a scan must not act on the defaults
  readonly readable: boolean
  // What the window shows: the saved choices, or the page's when the page
  // could not load them and runs on defaults (they are never saved then).
  #live: Settings

  constructor(readonly path = join(app.getPath('userData'), 'settings.json')) {
    removeStrayTmp(path)
    const file = openJsonFile(path, 'Settings file', isKnownSettingsFile)
    this.#data = parseStoredSettings(file.value)
    this.readable = file.canWrite
    if (file.canWrite) this.#writer = new JsonFileWriter(path, 500)
    this.#live = pageSettings(this.#data)
  }

  get(): Readonly<StoredSettings> {
    return this.#data
  }

  live(): Readonly<Settings> {
    return this.#live
  }

  // Checks the value like a file read, so a bad message can't store junk; a bad
  // field keeps its current value. Window sizes, place and folders stay main's own.
  // toFile false: the page could not load the settings, so its choices only
  // reach the window (size per template, theme), never the file.
  setFromPage(raw: unknown, toFile = true): { before: Settings; next: Settings } {
    const before = this.#live
    const next = parseStoredSettings(raw, { ...this.#data, ...before })
    this.#live = pageSettings(next)
    if (toFile) {
      next.windowSizes = this.#data.windowSizes
      next.windowPlace = this.#data.windowPlace
      next.folders = this.#data.folders
      this.#replace(next)
    }
    return { before, next: this.#live }
  }

  // Stored as the file parser would read it, so the file stays known.
  setWindowSize(id: TemplateId, raw: Size): void {
    const size = parseSize(raw, templates[id])
    if (!size) return
    const old = this.#data.windowSizes[id]
    if (old && old.width === size.width && old.height === size.height) return
    this.#replace({ ...this.#data, windowSizes: { ...this.#data.windowSizes, [id]: size } })
  }

  setWindowPlace(raw: WindowPlace): void {
    const place = parseWindowPlace(raw)
    if (!place) return
    this.#replace({ ...this.#data, windowPlace: place })
  }

  setFolders(folders: string[]): void {
    this.#replace({ ...this.#data, folders: parseFolders(folders) })
  }

  #replace(next: StoredSettings): void {
    if (JSON.stringify(next) === JSON.stringify(this.#data)) return
    this.#data = next
    this.#writer?.schedule(structuredClone(next))
  }

  flushSync(): void {
    this.#writer?.flushSync()
  }
}
