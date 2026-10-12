// plays.json: how often each song was played and when last (ticket 085).
// The page says when a song was heard; main counts it here and writes the
// file a little later, so a run of short songs is one write.
import { dirname, join } from 'path'
import { app } from 'electron'
import type { IdMoves } from '../shared/id-moves'
import type { PluginId } from '../shared/plugins'
import {
  addPlay,
  countsPlays,
  isKnownPlaysFile,
  movePlays,
  parsePlayedSong,
  parsePlays,
  playsFile,
  pluginCountsPlays,
  type Plays,
  type PlaysFile,
  type PlayStats,
  type StatsPeriod
} from '../shared/plays'
import { JsonFileWriter, openJsonFile, removeStrayTmp } from './json-file'
import { PlayLog } from './play-log'

export class PlaysStore {
  #data: Plays
  // none when the file could not be read: it is never replaced this session
  #writer: JsonFileWriter<PlaysFile> | undefined

  constructor(
    readonly path = join(app.getPath('userData'), 'plays.json'),
    readonly now: () => number = Date.now,
    // every play with the song's names, next to plays.json (ticket 115)
    readonly log = new PlayLog(join(dirname(path), 'plays-log.jsonl'))
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

  // A song was heard long enough to count (the page decides), with what the
  // page showed of it. Keys of plugins that don't count plays are dropped,
  // like any bad message; the log gets exactly the plays counted here.
  played(raw: unknown, song?: unknown): void {
    if (!countsPlays(raw)) return
    const now = this.now()
    this.#data = addPlay(this.#data, raw, now)
    this.#writer?.schedule(playsFile(this.#data))
    this.log.add(raw, parsePlayedSong(song), now)
  }

  stats(period: StatsPeriod): Promise<PlayStats> {
    return this.log.stats(period, this.now())
  }

  // False when the new ids are not on disk (see PlaylistFile.moveIds).
  moveIds(plugin: PluginId, moves: IdMoves): boolean {
    // the log may hold plays of ids plays.json no longer has, so it always hears
    const logged = !pluginCountsPlays(plugin) || this.log.moveIds(plugin, moves)
    const moved = movePlays(this.#data, plugin, moves)
    if (moved === this.#data) return logged
    this.#data = moved
    if (!this.#writer) return false
    this.#writer.schedule(playsFile(this.#data))
    return this.#writer.flushSync() && logged
  }

  flushSync(): void {
    this.#writer?.flushSync()
    this.log.flushSync()
  }
}
