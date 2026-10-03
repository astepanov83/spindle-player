// Files the page edits: playlists and the saved queue. Main checks what the
// page sends like a file read, keeps the latest, and writes it a bit later.
import { constants, copyFileSync } from 'fs'
import { basename, dirname, join } from 'path'
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
  parseSavedQueues,
  type SavedQueues
} from '../shared/saved-queue'
import { moveQueue, movePlaylists, type IdMoves } from '../shared/id-moves'
import {
  convertPlaylists,
  convertQueue,
  isOldPlaylistsFile,
  isOldQueueFile,
  readMfpIds,
  type MfpIds
} from './convert-files'
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

// An old file is converted once. openJsonFile kept it as "<name>.unknown",
// but that copy is replaced the next time a file can't be read back, e.g.
// after an older build ran (it starts empty on the new file and saves). So it
// is also kept as "<name>.v1.json", made once and never written over. Without
// that copy the file is not written this session.
function keepOld<T>(
  path: string,
  writer: JsonFileWriter<T> | undefined
): JsonFileWriter<T> | undefined {
  console.warn(`Converting old ${basename(path)} to version 2`)
  if (!writer) return undefined
  const to = join(dirname(path), `${basename(path, '.json')}.v1.json`)
  try {
    copyFileSync(path, to, constants.COPYFILE_EXCL)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return writer
    console.error(`Could not keep a copy of ${path}; not saving it this session`, error)
    return undefined
  }
  return writer
}

// The converted file is on disk at once, so it is converted only once.
function writeConverted<T>(writer: JsonFileWriter<T> | undefined, data: T): void {
  if (!writer) return
  writer.schedule(data)
  writer.flushSync()
}

// MFP's ids for a conversion, from mfp.json next to the file.
const mfpIdsBeside = (path: string): MfpIds => readMfpIds(join(dirname(path), 'mfp.json'))

export class PlaylistFile {
  #data: Playlist[]
  #writer: JsonFileWriter<unknown> | undefined

  constructor(readonly path = join(app.getPath('userData'), 'playlists.json')) {
    const f = open<unknown>(path, 'Playlists file', isKnownPlaylistsFile, 500)
    this.#writer = f.writer
    if (isOldPlaylistsFile(f.value)) {
      this.#writer = keepOld(path, f.writer)
      this.#data = convertPlaylists(f.value, mfpIdsBeside(path))
      writeConverted(this.#writer, playlistsFile(this.#data))
    } else this.#data = parsePlaylists(f.value)
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
  #data: SavedQueues
  #writer: JsonFileWriter<SavedQueues> | undefined

  constructor(readonly path = join(app.getPath('userData'), 'queue.json')) {
    // one line: a queue made from a big song table holds thousands of ids
    const f = open<SavedQueues>(path, 'Queue file', isKnownQueueFile, 1000, 0)
    this.#writer = f.writer
    if (isOldQueueFile(f.value)) {
      this.#writer = keepOld(path, f.writer)
      this.#data = convertQueue(f.value, mfpIdsBeside(path))
      writeConverted(this.#writer, this.#data)
    } else this.#data = parseSavedQueues(f.value)
  }

  get(): SavedQueues {
    return this.#data
  }

  // The page sends the track queue. What plays comes on its own (setPlaying),
  // so a new list keeps it.
  setFromPage(raw: unknown): void {
    this.#data = { ...this.#data, track: parseSavedQueue(raw) }
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
    this.#data = parseSavedQueues(moved)
    if (!this.#writer) return false
    this.#writer.schedule(this.#data)
    return this.#writer.flushSync()
  }

  // The current song and position come on their own and more often, without the whole list.
  setPlace(raw: unknown): void {
    const track = applyPlace(this.#data.track, raw)
    if (track === this.#data.track) return
    this.#data = { ...this.#data, track }
    this.#writer?.schedule(this.#data)
  }

  flushSync(): void {
    this.#writer?.flushSync()
  }
}
