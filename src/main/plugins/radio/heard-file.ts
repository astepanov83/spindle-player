// heard.json: songs heard on radio that the user kept (ticket 119). Kept by
// their title, not by a library id, so a rescan or a moved file changes
// nothing here. The path comes from the caller so the tests need no Electron.
import {
  addHeard,
  findHeard,
  heardFile,
  heardHashes,
  heardKey,
  isKnownHeardFile,
  parseHeard,
  removeHeard,
  withHeardCover,
  type HeardFile,
  type HeardSong
} from '../../../shared/plugins/radio/heard'
import type { SongCover } from '../../../shared/plugins/radio/stations'
import { JsonFileWriter, openJsonFile, removeStrayTmp } from '../../json-file'

export class HeardStore {
  #data: HeardSong[]
  // none when the file could not be read: it is never replaced this session
  #writer: JsonFileWriter<HeardFile> | undefined
  // songs removed this run, by heardKey, for Undo
  #removed = new Map<string, HeardSong>()

  constructor(readonly path: string) {
    removeStrayTmp(path)
    const f = openJsonFile(path, 'Heard songs file', isKnownHeardFile)
    this.#data = parseHeard(f.value)
    this.#writer = f.canWrite ? new JsonFileWriter<HeardFile>(path, 500) : undefined
  }

  // Oldest first.
  list(): HeardSong[] {
    return this.#data
  }

  // Their titles, so the song covers file keeps their covers (ticket 032).
  titles(): string[] {
    return this.#data.map((s) => s.raw)
  }

  // Each one gives back the list as it is now.
  save(song: HeardSong): HeardSong[] {
    this.#removed.delete(heardKey(song.raw))
    return this.#set(addHeard(this.#data, song))
  }

  remove(raw: unknown): HeardSong[] {
    if (typeof raw !== 'string') return this.#data
    const s = findHeard(this.#data, raw)
    if (!s) return this.#data
    this.#removed.set(heardKey(s.raw), s)
    return this.#set(removeHeard(this.#data, raw))
  }

  // Undo of a remove: back as it was, cover and date too. Nothing when it was
  // saved again meanwhile.
  restore(raw: unknown): HeardSong[] {
    if (typeof raw !== 'string') return this.#data
    const key = heardKey(raw)
    const s = this.#removed.get(key)
    if (!s) return this.#data
    this.#removed.delete(key)
    return this.#set(addHeard(this.#data, s))
  }

  // A cover the lookup found after the song was saved. True when one took it.
  setCover(raw: string, cover: SongCover): boolean {
    const was = this.#data
    return this.#set(withHeardCover(was, raw, cover)) !== was
  }

  hashes(): string[] {
    return heardHashes(this.#data)
  }

  #set(next: HeardSong[]): HeardSong[] {
    if (next === this.#data) return next
    this.#data = next
    this.#writer?.schedule(heardFile(next))
    return next
  }

  flushSync(): void {
    this.#writer?.flushSync()
  }
}
