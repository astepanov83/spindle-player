// Files the page edits: playlists and the saved queue. Main checks what the
// page sends like a file read, keeps the latest, and writes it a bit later.
import { join } from 'path'
import { app } from 'electron'
import { parsePlaylists, playlistsFile, type Playlist } from '../shared/playlists'
import { parseSavedQueue, type SavedQueue } from '../shared/saved-queue'
import { JsonFileWriter, readJsonFileKeepBroken } from './json-file'

export class PlaylistFile {
  #data: Playlist[]
  #writer: JsonFileWriter<unknown>

  constructor(readonly path = join(app.getPath('userData'), 'playlists.json')) {
    this.#data = parsePlaylists(readJsonFileKeepBroken(path, 'Playlists file'))
    this.#writer = new JsonFileWriter(path, 500)
  }

  get(): Playlist[] {
    return this.#data
  }

  setFromPage(raw: unknown): void {
    // anything but a list is a bad message, not "no playlists"
    if (!Array.isArray(raw)) return
    // the page sends the list itself; the file wraps it
    this.#data = parsePlaylists(playlistsFile(raw))
    this.#writer.schedule(playlistsFile(this.#data))
  }

  flushSync(): void {
    this.#writer.flushSync()
  }
}

export class QueueFile {
  #data: SavedQueue
  #writer: JsonFileWriter<SavedQueue>

  constructor(readonly path = join(app.getPath('userData'), 'queue.json')) {
    this.#data = parseSavedQueue(readJsonFileKeepBroken(path, 'Queue file'))
    // one line: a queue made from a big song table holds thousands of ids
    this.#writer = new JsonFileWriter(path, 1000, undefined, 0)
  }

  get(): SavedQueue {
    return this.#data
  }

  setFromPage(raw: unknown): void {
    this.#data = parseSavedQueue(raw)
    this.#writer.schedule(this.#data)
  }

  // The position comes on its own and more often, without the whole list.
  setPos(raw: unknown): void {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return
    if (!this.#data.items.length || this.#data.pos === raw) return
    this.#data = { ...this.#data, pos: raw }
    this.#writer.schedule(this.#data)
  }

  flushSync(): void {
    this.#writer.flushSync()
  }
}
