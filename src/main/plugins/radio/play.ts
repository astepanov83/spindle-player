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
} from '../../../shared/plugins/radio/stations'

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
    readonly started: (station: Station) => void = () => {},
    // false drops a find that comes back late (radio went off): nothing is saved
    readonly allowed: () => boolean = () => true
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
    // main owns `logo`: a station new to main starts with none
    const station = this.lookup(id) ?? withLogo(given, undefined)
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
    if (!found.length || !this.allowed()) return
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

  // What the page sent to Save, with the streams main found for it and the
  // choice made while it played: the page's copy is the one radio:play
  // answered with, before the server was asked. Undefined for a bad message.
  forSave(raw: unknown): Station | undefined {
    const given = parseStation(raw)
    const copy = given && this.#played.get(given.id)
    if (!given || !copy) return given
    const out = { ...given, streams: mergeStreams(given.streams, copy.streams) }
    const chosen = given.chosen ?? copy.chosen
    return chosen ? { ...out, chosen } : out
  }

  // The stream the user picked, on the copy kept here: a station from search
  // has no other, and plays with it again after a pause.
  choose(id: string, url: string): void {
    const played = this.#played.get(id)
    if (played?.streams.some((s) => s.url === url)) this.#played.set(id, { ...played, chosen: url })
  }

  // The logo of the copy kept here; My stations keep their own.
  setLogo(id: string, logo: StationLogo | undefined): void {
    const played = this.#played.get(id)
    if (played) this.#played.set(id, withLogo(played, logo))
  }

  // A search found these stations. One saved, or played this run, gets the
  // streams it lacks: Radio Browser may list a stream it did not have when the
  // station was saved, or one grouped in only later. These come from main's
  // own search, not from the page. True when My stations changed.
  searched(found: Station[]): boolean {
    let changed = false
    for (const f of found) {
      const saved = this.saved.get(f.id)
      if (saved) {
        this.saved.addStreams(f.id, f.streams)
        if (this.saved.get(f.id)?.streams !== saved.streams) changed = true
        continue
      }
      const played = this.#played.get(f.id)
      if (!played) continue
      const streams = mergeStreams(played.streams, f.streams)
      // set on a key it has keeps its place among the played
      if (streams !== played.streams) this.#played.set(f.id, { ...played, streams })
    }
    return changed
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
