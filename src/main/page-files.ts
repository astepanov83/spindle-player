// Files the page edits: playlists and the saved queue. Main checks what the
// page sends like a file read, keeps the latest, and writes it a bit later.
import { join } from 'path'
import { app } from 'electron'
import {
  isKnownPlaylistsFile,
  parsePlaylists,
  playlistsFile,
  type Playlist
} from '../shared/playlists'
import {
  applyPlace,
  isKnownQueueFile,
  parseSavedQueue,
  type SavedQueue
} from '../shared/saved-queue'
import { moveQueue, movePlaylists, type IdMoves } from '../shared/id-moves'
import { JsonFileWriter, openJsonFile, removeStrayTmp } from './json-file'

// Reads the file at start. A file that can't be read gets no writer, so it is
// never replaced this session (see openJsonFile).
function open<T>(
  path: string,
  what: string,
  known: (v: unknown) => boolean,
  delayMs: number,
  space = 2
): { value: unknown; writer: JsonFileWriter<T> | undefined } {
  removeStrayTmp(path)
  const file = openJsonFile(path, what, known)
  const writer = file.canWrite ? new JsonFileWriter<T>(path, delayMs, undefined, space) : undefined
  return { value: file.value, writer }
}

export class PlaylistFile {
  #data: Playlist[]
  #writer: JsonFileWriter<unknown> | undefined

  constructor(readonly path = join(app.getPath('userData'), 'playlists.json')) {
    const f = open<unknown>(path, 'Playlists file', isKnownPlaylistsFile, 500)
    this.#data = parsePlaylists(f.value)
    this.#writer = f.writer
  }

  get(): Playlist[] {
    return this.#data
  }

  setFromPage(raw: unknown): void {
    // anything but a list is a bad message, not "no playlists"
    if (!Array.isArray(raw)) return
    // the page sends the list itself; the file wraps it
    this.#data = parsePlaylists(playlistsFile(raw))
    this.#writer?.schedule(playlistsFile(this.#data))
  }

  // Songs whose ids changed (see id-moves.ts), checked like a file read.
  moveIds(moves: IdMoves): void {
    const moved = movePlaylists(this.#data, moves)
    if (moved === this.#data) return
    this.#data = parsePlaylists(playlistsFile(moved))
    this.#writer?.schedule(playlistsFile(this.#data))
  }

  flushSync(): void {
    this.#writer?.flushSync()
  }
}

export class QueueFile {
  #data: SavedQueue
  #writer: JsonFileWriter<SavedQueue> | undefined

  constructor(readonly path = join(app.getPath('userData'), 'queue.json')) {
    // one line: a queue made from a big song table holds thousands of ids
    const f = open<SavedQueue>(path, 'Queue file', isKnownQueueFile, 1000, 0)
    this.#data = parseSavedQueue(f.value)
    this.#writer = f.writer
  }

  get(): SavedQueue {
    return this.#data
  }

  setFromPage(raw: unknown): void {
    this.#data = parseSavedQueue(raw)
    this.#writer?.schedule(this.#data)
  }

  moveIds(moves: IdMoves): void {
    const moved = moveQueue(this.#data, moves)
    if (moved === this.#data) return
    this.#data = parseSavedQueue(moved)
    this.#writer?.schedule(this.#data)
  }

  // The current song and position come on their own and more often, without the whole list.
  setPlace(raw: unknown): void {
    const next = applyPlace(this.#data, raw)
    if (next === this.#data) return
    this.#data = next
    this.#writer?.schedule(this.#data)
  }

  flushSync(): void {
    this.#writer?.flushSync()
  }
}
