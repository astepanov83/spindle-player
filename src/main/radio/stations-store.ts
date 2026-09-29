// My stations (stations.json) and the titles heard on radio (radio-history.json),
// both in userData. The path comes from the caller so the tests need no Electron.
import {
  addTitle,
  chooseStream,
  historyFile,
  isKnownHistoryFile,
  isKnownStationsFile,
  mergeStreams,
  moveStation,
  parseHistory,
  parseStation,
  parseStations,
  pruneHistory,
  removeStation,
  saveStation,
  stationsFile,
  type HistoryEntry,
  type RadioHistory,
  type Station,
  type Stream
} from '../../shared/stations'
import { JsonFileWriter, openJsonFile, readJsonFile, removeStrayTmp } from '../json-file'

// Comes with the app. Its logo is resources/metal-only.png, so the first start needs no request.
export const metalOnly: Station = {
  id: 'metal-only',
  name: 'Metal Only',
  site: 'https://www.metal-only.de',
  tags: ['metal'],
  country: 'DE',
  pls: ['https://metal-only.streampanel.cloud/listen.pls'],
  streams: []
}

export class StationsStore {
  #data: Station[]
  #writer: JsonFileWriter<unknown> | undefined

  constructor(readonly path: string) {
    removeStrayTmp(path)
    // Only a missing file gets Metal Only. A broken one is kept aside and starts
    // empty, and a station the user removed must not come back.
    const missing = readJsonFile(path).kind === 'missing'
    const file = openJsonFile(path, 'Stations file', isKnownStationsFile)
    this.#writer = file.canWrite ? new JsonFileWriter<unknown>(path, 500) : undefined
    if (missing) {
      this.#data = [metalOnly]
      this.#writer?.schedule(stationsFile(this.#data))
      this.#writer?.flushSync()
    } else {
      this.#data = parseStations(file.value)
    }
  }

  list(): Station[] {
    return this.#data
  }

  get(id: string): Station | undefined {
    return this.#data.find((s) => s.id === id)
  }

  // What the page sends can't be trusted, so each method checks its arguments.
  // Each one gives back the list as it is now.
  save(raw: unknown): Station[] {
    const station = parseStation(raw)
    return station ? this.#set(saveStation(this.#data, station)) : this.#data
  }

  remove(id: unknown): Station[] {
    return typeof id === 'string' ? this.#set(removeStation(this.#data, id)) : this.#data
  }

  move(id: unknown, by: unknown): Station[] {
    if (typeof id !== 'string' || (by !== -1 && by !== 1)) return this.#data
    return this.#set(moveStation(this.#data, id, by))
  }

  choose(id: unknown, url: unknown): Station[] {
    if (typeof id !== 'string' || typeof url !== 'string') return this.#data
    return this.#set(chooseStream(this.#data, id, url))
  }

  // Streams found on the server. A station removed meanwhile stays removed.
  addStreams(id: string, found: Stream[]): Station[] {
    const s = this.get(id)
    if (!s) return this.#data
    const streams = mergeStreams(s.streams, found)
    if (streams === s.streams) return this.#data
    return this.#set(saveStation(this.#data, { ...s, streams }))
  }

  #set(next: Station[]): Station[] {
    if (next === this.#data) return next
    this.#data = next
    this.#writer?.schedule(stationsFile(next))
    return next
  }

  flushSync(): void {
    this.#writer?.flushSync()
  }
}

export class RadioHistoryStore {
  #data: RadioHistory
  #writer: JsonFileWriter<RadioHistory> | undefined

  // `isSaved`: whether a station is in My stations. `now` is for the tests.
  constructor(
    readonly path: string,
    readonly isSaved: (id: string) => boolean,
    readonly now: () => number = Date.now
  ) {
    removeStrayTmp(path)
    const file = openJsonFile(path, 'Radio history file', isKnownHistoryFile)
    this.#writer = file.canWrite
      ? new JsonFileWriter<RadioHistory>(path, 1000, undefined, 0)
      : undefined
    this.#data = pruneHistory(parseHistory(file.value), isSaved, now())
  }

  // Oldest first; the last one is the song playing.
  get(id: string): HistoryEntry[] {
    return this.#data.byStation[id] ?? []
  }

  add(id: string, title: string, at = this.now()): void {
    const next = pruneHistory(addTitle(this.#data, id, title, at), this.isSaved, this.now())
    if (next === this.#data) return
    this.#data = next
    this.#writer?.schedule(historyFile(next))
  }

  flushSync(): void {
    this.#writer?.flushSync()
  }
}
