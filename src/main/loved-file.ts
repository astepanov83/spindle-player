// loved.json: the songs the user loved and when (ticket 117). The page says
// which songs were loved or unloved; main keeps them here and writes the file
// a little later, so a run of clicks is one write.
import { join } from 'path'
import { app } from 'electron'
import type { IdMoves } from '../shared/id-moves'
import type { PluginId } from '../shared/plugins'
import {
  isKnownLovedFile,
  lovedFile,
  moveLoved,
  parseLoved,
  parseLoveKeys,
  setLoved,
  type Loved,
  type LovedFile
} from '../shared/loved'
import { JsonFileWriter, openJsonFile, removeStrayTmp } from './json-file'

export class LovedStore {
  #data: Loved
  // none when the file could not be read: it is never replaced this session
  #writer: JsonFileWriter<LovedFile> | undefined

  constructor(
    readonly path = join(app.getPath('userData'), 'loved.json'),
    readonly now: () => number = Date.now
  ) {
    removeStrayTmp(path)
    const f = openJsonFile(path, 'Loved file', isKnownLovedFile)
    this.#data = parseLoved(f.value)
    this.#writer = f.canWrite ? new JsonFileWriter<LovedFile>(path, 1000) : undefined
  }

  get(): Loved {
    return this.#data
  }

  // Songs loved (`on` true) or unloved. A bad message is dropped, and so are
  // keys of plugins whose songs can't be loved.
  set(rawKeys: unknown, on: unknown): void {
    const keys = parseLoveKeys(rawKeys)
    if (!keys || typeof on !== 'boolean') return
    const next = setLoved(this.#data, keys, on, this.now())
    if (next === this.#data) return
    this.#data = next
    this.#writer?.schedule(lovedFile(this.#data))
  }

  // False when the new ids are not on disk (see PlaylistFile.moveIds).
  moveIds(plugin: PluginId, moves: IdMoves): boolean {
    const moved = moveLoved(this.#data, plugin, moves)
    if (moved === this.#data) return true
    this.#data = moved
    if (!this.#writer) return false
    this.#writer.schedule(lovedFile(this.#data))
    return this.#writer.flushSync()
  }

  flushSync(): void {
    this.#writer?.flushSync()
  }
}
