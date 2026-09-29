// The station playing, its stream and titles, and reconnecting when the stream
// drops. See work/specs/radio.md, "Playing a live stream". The moves are plain
// functions in radio/logic.ts; playing.svelte.ts says when radio has the player.
import type { Art } from '../../../shared/library'
import type { RadioCover, RadioLogo, RadioTitle } from '../../../shared/ipc'
import {
  addEntry,
  historyTitle,
  songArt,
  stationArt,
  withLogo,
  type HistoryEntry,
  type Station,
  type StationLogo
} from '../../../shared/stations'
import { engine, type EngineEvents } from '../audio/engine'
import {
  cantPlayFormat,
  firstStream,
  nextStream,
  parseTitle,
  radioUrl,
  retryDelayMs
} from '../radio/logic'
import { notice } from './notice.svelte'
import { player } from './player.svelte'

// A stream stuck this long with no data is taken for dropped.
const stallMs = 8000
// Before a connection's first sound: longer than main waits for the server
// (10 s, stream.ts), so main's answer comes first and says what happened.
const firstSoundMs = 12000
// failed retries of one stream before the next stream
const retriesPerStream = 3

class RadioStore {
  // My stations, in the user's order
  stations: Station[] = $state.raw([])
  // the station playing, or picked and paused
  station: Station | undefined = $state.raw()
  // index into station.streams
  stream = $state(-1)
  // the stream's title as it came, and its parts
  title = $state('')
  now = $derived(parseTitle(this.title))
  // the station's last titles, oldest first
  history: HistoryEntry[] = $state.raw([])
  // The cover main found for the title playing (ticket 032), else the logo as a
  // cover (ticket 030), a tile in the fixed colors until main made it. The
  // cover is kept on the title's history entry, so the row shows it too.
  art: Art | undefined = $derived.by(() => {
    if (!this.station) return undefined
    const last = this.history.at(-1)
    const song = this.title && last?.title === historyTitle(this.title) ? last.cover : undefined
    return song ? songArt(song) : stationArt(this.station)
  })
  // the station is in My stations; else the controls offer Save
  saved = $derived(!!this.station && this.stations.some((s) => s.id === this.station!.id))

  // Time listened to this station: ms with sound before now, and since when
  // sound comes out. Stop keeps it; another station starts from 0.
  #heardMs = $state(0)
  #soundSince: number | undefined = $state()

  // the user wants sound: reconnect while this holds
  #wanted = false
  // counts plays, so an answer for an older one is dropped
  #seq = 0
  // failed retries of the current stream, and reconnects of the station
  #retries = 0
  #reconnects = 0
  #failed = new Set<number>()
  #formatFailed = new Set<number>()
  // counts connections, so a late answer about an older one is dropped
  #connects = 0
  // sound came out of this connection
  #sound = false
  // this connection failed already: 'error' can follow 'ended'
  #down = false
  #retryTimer: ReturnType<typeof setTimeout> | undefined
  #stallTimer: ReturnType<typeof setTimeout> | undefined
  // logos main sent before My stations came, applied when they come
  #early: Map<string, StationLogo | undefined> | undefined = new Map()
  // stations main is saving now
  #saving = new Set<string>()

  // The engine's events while radio has the player (playing.svelte.ts passes them on).
  readonly events: Partial<EngineEvents> = {
    playing: () => {
      clearTimeout(this.#stallTimer)
      this.#soundStarts()
      this.#sound = true
      this.#retries = 0
      this.#reconnects = 0
      this.#failed.clear()
      this.#formatFailed.clear()
    },
    waiting: () => {
      this.#soundStops()
      if (!this.#wanted) return
      clearTimeout(this.#stallTimer)
      const ms = this.#sound ? stallMs : firstSoundMs
      this.#stallTimer = setTimeout(() => this.#lost(`no data for ${ms / 1000} s`), ms)
    },
    // the server closed the stream
    ended: () => this.#lost('the stream ended'),
    error: (e) => this.#lost(`error ${e.code} ${e.message}`),
    // Chromium paused the element itself (the system's audio, not our handlers):
    // a pause like the user's. Our own pauses leave no source (a reconnect, a
    // new station) or are followed by a new play (another stream) before this comes.
    paused: () => {
      if (!this.#wanted || this.#down || !engine.loaded || !engine.el.paused) return
      this.pause()
    },
    refused: (message) => {
      window.playbackApi.log(`Radio refused: ${message}`)
      this.pause()
    }
  }

  // Heard from the start: main makes Metal Only's shipped logo at start, and
  // its event can come before the page has My stations.
  constructor() {
    window.radioApi.onTitle((t) => this.#heard(t))
    window.radioApi.onLogo((l) => this.#logo(l))
    window.radioApi.onCover((c) => this.#cover(c))
  }

  // My stations from main, at start.
  load(stations: Station[]): void {
    const early = this.#early
    this.#early = undefined
    this.stations = early?.size
      ? stations.map((s) => (early.has(s.id) ? withLogo(s, early.get(s.id)) : s))
      : stations
  }

  // Picked but not playing: after a restart.
  select(station: Station): void {
    this.pause()
    this.#show(station)
    this.stream = firstStream(station)
  }

  // Asks main for the station's streams, then opens one at the live edge.
  async play(station: Station): Promise<void> {
    const n = this.#start()
    // the song or the last station stops now, not when main answers
    engine.clear()
    const same = station.id === this.station?.id
    this.#show(station)
    let known: Station | undefined
    try {
      known = await window.radioApi.play($state.snapshot(station) as Station)
    } catch (e) {
      window.playbackApi.log(`Radio ${station.id}: radio:play failed: ${String(e)}`)
    }
    if (n !== this.#seq) return
    if (!known) return this.#giveUp()
    this.station = known
    this.stations = this.stations.map((s) => (s.id === known.id ? known : s))
    // play again after a pause keeps the stream it had
    if (!same || !known.streams[this.stream]) this.stream = firstStream(known)
    if (this.stream < 0) return this.#giveUp()
    this.#connect()
  }

  // Play after pause: a new connection at the live edge.
  async resume(): Promise<void> {
    if (this.station) await this.play(this.station)
  }

  // Drops the connection, so nothing old plays after a long pause. Main ends
  // the stream; the element keeps it, paused: with no source Chromium drops the
  // system's media controls (MPRIS said Stopped and Play did nothing).
  pause(): void {
    this.#seq++
    this.#wanted = false
    clearTimeout(this.#retryTimer)
    clearTimeout(this.#stallTimer)
    player.playing = false
    this.#soundStops()
    engine.pause()
    window.radioApi.stop()
  }

  get wanted(): boolean {
    return this.#wanted
  }

  // sound comes out now: LIVE lights up
  get sounding(): boolean {
    return this.#soundSince !== undefined
  }

  // ms of sound from this station since it was picked
  listened(now = Date.now()): number {
    // the controls' tick can hold a now from just before the sound started
    return (
      this.#heardMs + (this.#soundSince === undefined ? 0 : Math.max(0, now - this.#soundSince))
    )
  }

  // Save: a station tried from search goes into My stations. The playing
  // one by default; the Radio view saves any result.
  async save(station: Station | undefined = this.station): Promise<void> {
    const s = station
    // a second click while main saves
    if (!s || this.stations.some((x) => x.id === s.id) || this.#saving.has(s.id)) return
    this.#saving.add(s.id)
    try {
      this.stations = await window.radioApi.save($state.snapshot(s) as Station)
    } catch (e) {
      window.playbackApi.log(`Radio ${s.id}: radio:save failed: ${String(e)}`)
      notice.show(`Couldn't save ${s.name}`)
    } finally {
      this.#saving.delete(s.id)
    }
  }

  // Out of My stations. The playing station goes on playing, unsaved: the
  // controls offer Save again.
  async remove(id: string): Promise<void> {
    const s = this.stations.find((x) => x.id === id)
    try {
      this.stations = await window.radioApi.remove(id)
    } catch (e) {
      window.playbackApi.log(`Radio ${id}: radio:remove failed: ${String(e)}`)
      notice.show(`Couldn't remove ${s?.name ?? 'the station'}`)
    }
  }

  // One place up (-1) or down (1) in My stations.
  async move(id: string, by: -1 | 1): Promise<void> {
    try {
      this.stations = await window.radioApi.move(id, by)
    } catch (e) {
      window.playbackApi.log(`Radio ${id}: radio:move failed: ${String(e)}`)
    }
  }

  // The user picked another stream: kept as the station's choice.
  choose(index: number): void {
    const s = this.station
    const stream = s?.streams[index]
    if (!s || !stream) return
    this.stream = index
    this.#failed.clear()
    this.#formatFailed.clear()
    this.#retries = 0
    this.station = { ...s, chosen: stream.url }
    // main keeps it in My stations, or on its copy of a station from search
    void window.radioApi.choose(s.id, stream.url).then((list) => {
      this.stations = list
    })
    if (!this.#wanted) return
    clearTimeout(this.#retryTimer)
    clearTimeout(this.#stallTimer)
    engine.clear()
    this.#connect()
  }

  // A new try for the user: all counts start again.
  #start(): number {
    clearTimeout(this.#retryTimer)
    clearTimeout(this.#stallTimer)
    this.#retries = 0
    this.#reconnects = 0
    this.#failed.clear()
    this.#formatFailed.clear()
    this.#wanted = true
    player.playing = true
    // an answer about the last connection must not act on this one
    this.#connects++
    return ++this.#seq
  }

  #show(station: Station): void {
    if (station.id === this.station?.id) return
    this.station = station
    this.#heardMs = 0
    this.#soundSince = undefined
    this.title = ''
    this.history = []
    const id = station.id
    // Main adds a title to its file before it sends it, so its answer already
    // has any title heard while it was on the way.
    void window.radioApi.history(id).then(
      (h) => {
        if (this.station?.id === id) this.history = h
      },
      () => {}
    )
  }

  #soundStarts(): void {
    this.#soundSince ??= Date.now()
  }

  #soundStops(): void {
    this.#heardMs = this.listened()
    this.#soundSince = undefined
  }

  #connect(): void {
    this.#soundStops()
    this.#connects++
    this.#sound = false
    this.#down = false
    engine.load(radioUrl(this.station!.id, this.stream, this.#connects), 0, undefined, {
      live: true
    })
    engine.play()
  }

  // The connection failed, ended or stalled. Before any sound, main is asked what
  // it answered: audio with no sound is a format Chromium can't play (next
  // stream at once); anything else is the network (the same stream, after a wait).
  #lost(why: string): void {
    if (!this.#wanted || this.#down) return
    this.#down = true
    this.#soundStops()
    clearTimeout(this.#retryTimer)
    clearTimeout(this.#stallTimer)
    // closes a stalled connection too
    engine.clear()
    const s = this.station!
    window.playbackApi.log(`Radio ${s.id}: stream ${this.stream}: ${why}`)
    if (this.#sound) return this.#retry()
    const at = this.#connects
    const seq = this.#seq
    void window.radioApi
      .lastAnswer(s.id)
      .catch(() => undefined)
      .then((a) => {
        if (!this.#wanted || at !== this.#connects || seq !== this.#seq) return
        if (!cantPlayFormat(false, a)) return this.#retry()
        window.playbackApi.log(`Radio ${s.id}: stream ${this.stream}: audio came, but no sound`)
        this.#formatFailed.add(this.stream)
        this.#nextStream()
      })
  }

  // The same stream again after a wait, or the next one after 3 failed retries.
  #retry(): void {
    if (this.#retries >= retriesPerStream) return this.#nextStream()
    this.#retries++
    this.#retryTimer = setTimeout(() => this.#connect(), retryDelayMs(this.#reconnects++))
  }

  #nextStream(): void {
    const s = this.station!
    this.#failed.add(this.stream)
    const next = nextStream(s.streams, this.stream, this.#failed)
    if (next < 0) return this.#giveUp()
    this.stream = next
    this.#retries = 0
    this.#connect()
  }

  #giveUp(): void {
    const name = this.station?.name ?? ''
    const format = this.#formatFailed.size > 0 && this.#formatFailed.size === this.#failed.size
    this.pause()
    notice.show(format ? `Format can't be played: ${name}` : `Station can't be reached: ${name}`)
  }

  #logo({ id, logo }: RadioLogo): void {
    this.#early?.set(id, logo)
    this.stations = this.stations.map((s) => (s.id === id ? withLogo(s, logo) : s))
    if (this.station?.id === id) this.station = withLogo(this.station, logo)
  }

  // Only for the title playing: an answer for one that changed since is dropped.
  #cover({ stationId, title, cover }: RadioCover): void {
    if (stationId !== this.station?.id || title !== this.title) return
    const last = this.history.at(-1)
    if (last?.title !== historyTitle(title)) return
    this.history = [...this.history.slice(0, -1), { ...last, cover }]
  }

  #heard(t: RadioTitle): void {
    if (t.stationId !== this.station?.id) return
    this.title = t.title
    this.history = addEntry(this.history, t.title, t.at)
  }
}

export const radio = new RadioStore()
