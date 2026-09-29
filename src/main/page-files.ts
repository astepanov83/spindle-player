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
  applyPlaying,
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

  // Songs whose ids changed (see id-moves.ts), checked like a file read and
  // written at once: the library process drops the map once it hears back.
  // False when the new ids are not on disk: no writer this session, or the write failed.
  moveIds(moves: IdMoves): boolean {
    const moved = movePlaylists(this.#data, moves)
    if (moved === this.#data) return true
    this.#data = parsePlaylists(playlistsFile(moved))
    if (!this.#writer) return false
    this.#writer.schedule(playlistsFile(this.#data))
    return this.#writer.flushSync()
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

  // What plays comes on its own (setPlaying), so a new list keeps it.
  setFromPage(raw: unknown): void {
    const { kind, station } = this.#data
    this.#data = applyPlaying(parseSavedQueue(raw), kind ? { kind, station } : { kind: 'queue' })
    this.#writer?.schedule(this.#data)
  }

  // Radio or the queue (ticket 027).
  setPlaying(raw: unknown): void {
    const next = applyPlaying(this.#data, raw)
    if (next === this.#data) return
    this.#data = next
    this.#writer?.schedule(this.#data)
  }

  // False when the new ids are not on disk (see PlaylistFile.moveIds).
  moveIds(moves: IdMoves): boolean {
    const moved = moveQueue(this.#data, moves)
    if (moved === this.#data) return true
    this.#data = parseSavedQueue(moved)
    if (!this.#writer) return false
    this.#writer.schedule(this.#data)
    return this.#writer.flushSync()
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
