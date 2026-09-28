// Main owns the settings file. The page gets a copy at start and sends back each change.
import { join } from 'path'
import { app } from 'electron'
import type { TemplateId } from '../shared/layout'
import {
  isKnownSettingsFile,
  parseFolders,
  parseStoredSettings,
  type Size,
  type StoredSettings
} from '../shared/settings'
import { JsonFileWriter, openJsonFile, removeStrayTmp } from './json-file'

export class SettingsStore {
  #data: StoredSettings
  // none when the file could not be read: it may still be fine, so it is never replaced
  #writer: JsonFileWriter<StoredSettings> | undefined
  // false when the folder list on disk is unknown, so a scan must not act on the defaults
  readonly readable: boolean

  constructor(readonly path = join(app.getPath('userData'), 'settings.json')) {
    removeStrayTmp(path)
    const file = openJsonFile(path, 'Settings file', isKnownSettingsFile)
    this.#data = parseStoredSettings(file.value)
    this.readable = file.canWrite
    if (file.canWrite) this.#writer = new JsonFileWriter(path, 500)
  }

  get(): Readonly<StoredSettings> {
    return this.#data
  }

  // Checks the value like a file read, so a bad message can't store junk; a bad
  // field keeps its current value. Window sizes and folders stay main's own.
  setFromPage(raw: unknown): StoredSettings {
    const next = parseStoredSettings(raw, this.#data)
    next.windowSizes = this.#data.windowSizes
    next.folders = this.#data.folders
    this.#replace(next)
    return next
  }

  setWindowSize(id: TemplateId, size: Size): void {
    const old = this.#data.windowSizes[id]
    if (old && old.width === size.width && old.height === size.height) return
    this.#replace({ ...this.#data, windowSizes: { ...this.#data.windowSizes, [id]: size } })
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
