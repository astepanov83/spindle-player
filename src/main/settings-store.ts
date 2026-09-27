// Main owns the settings file. The page gets a copy at start and sends back each change.
import { copyFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { TemplateId } from '../shared/layout'
import { parseStoredSettings, type Size, type StoredSettings } from '../shared/settings'
import { JsonFileWriter, readJsonFile } from './json-file'

export class SettingsStore {
  #data: StoredSettings
  #writer: JsonFileWriter<StoredSettings>

  constructor(readonly path = join(app.getPath('userData'), 'settings.json')) {
    const read = readJsonFile(path)
    if (read.kind === 'broken') {
      // Keep the broken file for a look later, since the next save replaces it.
      console.error(`Settings file is broken, using defaults: ${path}`, read.error)
      try {
        copyFileSync(path, `${path}.broken`)
      } catch {
        // nothing more to save
      }
    }
    this.#data = parseStoredSettings(read.kind === 'ok' ? read.value : undefined)
    this.#writer = new JsonFileWriter(path, 500)
  }

  get(): Readonly<StoredSettings> {
    return this.#data
  }

  // Checks the value like a file read, so a bad message can't store junk.
  // Window sizes stay main's own.
  setFromPage(raw: unknown): StoredSettings {
    const next = parseStoredSettings(raw)
    next.windowSizes = this.#data.windowSizes
    this.#replace(next)
    return next
  }

  setWindowSize(id: TemplateId, size: Size): void {
    const old = this.#data.windowSizes[id]
    if (old && old.width === size.width && old.height === size.height) return
    this.#replace({ ...this.#data, windowSizes: { ...this.#data.windowSizes, [id]: size } })
  }

  #replace(next: StoredSettings): void {
    if (JSON.stringify(next) === JSON.stringify(this.#data)) return
    this.#data = next
    this.#writer.schedule(structuredClone(next))
  }

  flushSync(): void {
    this.#writer.flushSync()
  }
}
