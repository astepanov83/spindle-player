// radio:play (ticket 027): the page says which station it is about to play.
// Main keeps a copy, so spindle://radio finds a station from search and one
// removed from My stations while it plays, and asks the station's server for
// its streams (findStreams) before the page loads one.
import {
  mergeStreams,
  parseStation,
  withLogo,
  type Station,
  type StationLogo,
  type Stream
} from '../../shared/stations'

// What this needs of StationsStore.
export interface SavedStationsLike {
  get(id: string): Station | undefined
  addStreams(id: string, found: Stream[]): Station[]
}

// Stations played this run, kept apart from My stations. Enough for a long
// evening of trying stations from search.
const maxPlayed = 100

export class PlayedStations {
  #played = new Map<string, Station>()
  // asked the server this run; once is enough while it has streams
  #asked = new Set<string>()
  #finding = new Map<string, Promise<void>>()

  constructor(
    readonly saved: SavedStationsLike,
    readonly find: (station: Station) => Promise<Stream[]>,
    readonly log: (text: string) => void,
    // told at once which station plays, as main knows it (its logo is looked up behind)
    readonly started: (station: Station) => void = () => {}
  ) {}

  // My stations first: that copy has the latest streams and choice.
  lookup(id: string): Station | undefined {
    return this.saved.get(id) ?? this.#played.get(id)
  }

  // The station as main knows it now, or undefined for a bad message. A saved
  // station is taken from My stations, not from what the page sent. With no
  // streams yet (Metal Only on the first run) the answer waits for the server;
  // otherwise it comes at once and new streams are added behind it.
  async play(raw: unknown): Promise<Station | undefined> {
    const given = parseStation(raw)
    if (!given) return undefined
    const id = given.id
    const station = this.lookup(id) ?? given
    this.#remember(station)
    this.started(station)
    if (this.#asked.has(id) && station.streams.length) return station
    this.#asked.add(id)
    let job = this.#finding.get(id)
    if (!job) {
      job = this.#findFor(station).finally(() => this.#finding.delete(id))
      this.#finding.set(id, job)
    }
    if (station.streams.length) return station
    await job
    return this.lookup(id)
  }

  async #findFor(station: Station): Promise<void> {
    let found: Stream[]
    try {
      found = await this.find(station)
    } catch (e) {
      this.log(`Radio ${station.id}: could not look for streams: ${String(e)}`)
      return
    }
    if (!found.length) return
    const id = station.id
    const saved = this.saved.get(id)
    if (saved) {
      this.saved.addStreams(id, found)
      this.#remember(this.saved.get(id)!)
      return
    }
    const played = this.#played.get(id)
    if (played) this.#remember({ ...played, streams: mergeStreams(played.streams, found) })
  }

  // The logo of the copy kept here; My stations keep their own.
  setLogo(id: string, logo: StationLogo | undefined): void {
    const played = this.#played.get(id)
    if (played) this.#played.set(id, withLogo(played, logo))
  }

  // The newest last, so the oldest goes first when there are too many.
  #remember(station: Station): void {
    this.#played.delete(station.id)
    this.#played.set(station.id, station)
    if (this.#played.size > maxPlayed) {
      const oldest = this.#played.keys().next().value!
      this.#played.delete(oldest)
    }
  }
}
