// positions.json: where long songs were left (ticket 114). The page says where
// a song is while it plays (every 10 s, on pause and on a song change); main
// keeps it here and writes the file a little later, so it is not a write
// each time.
import { join } from 'path'
import { app } from 'electron'
import type { IdMoves } from '../shared/id-moves'
import type { PluginId } from '../shared/plugins'
import {
  isKnownPositionsFile,
  movePositions,
  parsePositions,
  parsePositionSet,
  positionsFile,
  setPosition,
  type Positions,
  type PositionsFile
} from '../shared/positions'
import { JsonFileWriter, openJsonFile, removeStrayTmp } from './json-file'

export class PositionsStore {
  #data: Positions
  // none when the file could not be read: it is never replaced this session
  #writer: JsonFileWriter<PositionsFile> | undefined

  constructor(
    readonly path = join(app.getPath('userData'), 'positions.json'),
    readonly now: () => number = Date.now
  ) {
    removeStrayTmp(path)
    const f = openJsonFile(path, 'Positions file', isKnownPositionsFile)
    this.#data = parsePositions(f.value)
    this.#writer = f.canWrite ? new JsonFileWriter<PositionsFile>(path, 2000) : undefined
  }

  get(): Positions {
    return this.#data
  }

  // A song's place, or null to forget it. A bad message is dropped, and so
  // are keys of plugins whose songs keep no place.
  set(rawKey: unknown, rawPos: unknown): void {
    const m = parsePositionSet(rawKey, rawPos)
    if (!m) return
    const next = setPosition(this.#data, m.key, m.pos, this.now())
    if (next === this.#data) return
    this.#data = next
    this.#writer?.schedule(positionsFile(this.#data))
  }

  // False when the new ids are not on disk (see PlaylistFile.moveIds).
  moveIds(plugin: PluginId, moves: IdMoves): boolean {
    const moved = movePositions(this.#data, plugin, moves)
    if (moved === this.#data) return true
    this.#data = moved
    if (!this.#writer) return false
    this.#writer.schedule(positionsFile(this.#data))
    return this.#writer.flushSync()
  }

  flushSync(): void {
    this.#writer?.flushSync()
  }
}
