// plays.json: how often each song was played and when last (ticket 085).
// The page says when a song was heard; main counts it here and writes the
// file a little later, so a run of short songs is one write.
import { join } from 'path'
import { app } from 'electron'
import type { IdMoves } from '../shared/id-moves'
import type { PluginId } from '../shared/plugins'
import {
  addPlay,
  countsPlays,
  isKnownPlaysFile,
  movePlays,
  parsePlays,
  playsFile,
  type Plays,
  type PlaysFile
} from '../shared/plays'
import { JsonFileWriter, openJsonFile, removeStrayTmp } from './json-file'

export class PlaysStore {
  #data: Plays
  // none when the file could not be read: it is never replaced this session
  #writer: JsonFileWriter<PlaysFile> | undefined

  constructor(
    readonly path = join(app.getPath('userData'), 'plays.json'),
    readonly now: () => number = Date.now
  ) {
    removeStrayTmp(path)
    const f = openJsonFile(path, 'Plays file', isKnownPlaysFile)
    this.#data = parsePlays(f.value)
    // one line: a big library has an entry for most of its songs
    this.#writer = f.canWrite ? new JsonFileWriter<PlaysFile>(path, 2000, undefined, 0) : undefined
  }

  get(): Plays {
    return this.#data
  }

  // A song was heard long enough to count (the page decides). Keys of
  // plugins that don't count plays are dropped, like any bad message.
  played(raw: unknown): void {
    if (!countsPlays(raw)) return
    this.#data = addPlay(this.#data, raw, this.now())
    this.#writer?.schedule(playsFile(this.#data))
  }

  // False when the new ids are not on disk (see PlaylistFile.moveIds).
  moveIds(plugin: PluginId, moves: IdMoves): boolean {
    const moved = movePlays(this.#data, plugin, moves)
    if (moved === this.#data) return true
    this.#data = moved
    if (!this.#writer) return false
    this.#writer.schedule(playsFile(this.#data))
    return this.#writer.flushSync()
  }

  flushSync(): void {
    this.#writer?.flushSync()
  }
}
