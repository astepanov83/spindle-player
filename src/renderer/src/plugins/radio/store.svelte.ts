// The station playing, its stream and titles, and reconnecting when the stream
// drops. See work/specs/radio.md, "Playing a live stream". The moves are plain
// functions in logic.ts. The core plays what this loads through the handle it
// gives (index.ts is the LivePlugin over this store).
import type { Art } from '../../../../shared/library'
import type { RadioCover, RadioLogo, RadioTitle } from '../../../../shared/ipc'
import {
  addEntry,
  historyTitle,
  songArt,
  stationArt,
  withLogo,
  type HistoryEntry,
  type Station,
  type StationLogo
} from '../../../../shared/stations'
import type { EngineEvents } from '../../audio/engine'
import { notice } from '../../stores/notice.svelte'
import type { Action, ItemInfo, LiveHandle, PageAddress, Playable } from '../types'
import {
  cantPlayFormat,
  firstStream,
  historyEntries,
  nextStream,
  parseTitle,
  radioUrl,
  retryDelayMs,
  streamChoices
} from './logic'

// A stream stuck this long with no data is taken for dropped.
const stallMs = 8000
// Before a connection's first sound: longer than main waits for the server
// (10 s, stream.ts), so main's answer comes first and says what happened.
const firstSoundMs = 12000
// A stall shorter than this does not flash BUFFERING.
const bufferingMs = 1000
// failed retries of one stream before the next stream
const retriesPerStream = 3

// What the dot next to the controls' LIVE says.
export type RadioStatus = 'off' | 'connecting' | 'live' | 'buffering' | 'reconnecting'

// The Radio view: what a station's name links to.
export const radioPage: PageAddress = { plugin: 'radio', page: '' }

// No Next or Previous on the bar (decision 150); the media keys still step
// through My stations (LivePlugin.next).
const liveCan = { seek: false, pause: true, next: false, previous: false }

class RadioStore {
  // My stations, in the user's order. These three set the bar's actions (the
  // stream picked, Save), so the core hears each change.
  get stations(): Station[] {
    return this.#stations
  }
  set stations(list: Station[]) {
    this.#stations = list
    this.#tellActions()
  }
  #stations: Station[] = $state.raw([])
  // the station playing, or picked and paused
  get station(): Station | undefined {
    return this.#station
  }
  set station(s: Station | undefined) {
    this.#station = s
    this.#tellActions()
  }
  #station: Station | undefined = $state.raw()
  // index into station.streams
  get stream(): number {
    return this.#stream
  }
  set stream(i: number) {
    this.#stream = i
    this.#tellActions()
  }
  #stream = $state(-1)
  // My stations came from main: a station not in them is gone
  loaded = $state(false)
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
  // the Radio view's row shows it; the core's bar hears it through the handle
  status: RadioStatus = $state('off')

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
  #bufferingTimer: ReturnType<typeof setTimeout> | undefined
  // logos main sent before My stations came, applied when they come
  #early: Map<string, StationLogo | undefined> | undefined = new Map()
  // stations main is saving now
  #saving = new Set<string>()
  // the core's handle for the station: loads, stops, and hears what is on air
  #h: LiveHandle | undefined
  // a station the Radio view is about to play (a search result is in no list)
  #offered: Station | undefined

  // The engine's events while radio has the player (the core passes them on).
  readonly events: Partial<EngineEvents> = {
    playing: () => {
      clearTimeout(this.#stallTimer)
      if (this.#wanted) this.#setStatus('live', `Live on ${this.#streamLabel()}`)
      this.#sound = true
      this.#retries = 0
      this.#reconnects = 0
      this.#failed.clear()
      this.#formatFailed.clear()
    },
    waiting: () => {
      if (!this.#wanted) return
      clearTimeout(this.#stallTimer)
      const ms = this.#sound ? stallMs : firstSoundMs
      // before the first sound it stays connecting or reconnecting
      if (this.#sound && this.status === 'live') {
        clearTimeout(this.#bufferingTimer)
        this.#bufferingTimer = setTimeout(
          () => this.#setStatus('buffering', 'Waiting for data from the station'),
          bufferingMs
        )
      }
      this.#stallTimer = setTimeout(() => this.#lost(`no data for ${ms / 1000} s`), ms)
    },
    // the server closed the stream
    ended: () => this.#lost('the stream ended'),
    error: (e) => this.#lost(`error ${e.code} ${e.message}`),
    // Chromium paused the element itself (the system's audio, not our handlers):
    // a pause like the user's. The core passes it on only while the element
    // still has a source and is paused: our own pauses leave no source (a
    // reconnect, a new station) or are followed by a new play (another stream).
    paused: () => {
      if (!this.#wanted || this.#down) return
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
    this.loaded = true
  }

  // A station by id: in My stations, the one playing, or one the Radio view offered.
  find(id: string): Station | undefined {
    return (
      this.stations.find((s) => s.id === id) ??
      (this.station?.id === id ? this.station : undefined) ??
      (this.#offered?.id === id ? this.#offered : undefined)
    )
  }

  // The Radio view plays this copy (a search result, or a saved one with its
  // chosen stream), not the one find gives. It counts only while `play`
  // starts: a play refused (radio off) leaves no station behind.
  playOffered(station: Station, play: () => void): void {
    this.#offered = station
    try {
      play()
    } finally {
      this.#offered = undefined
    }
  }

  // What play takes for an id: the offered copy once, else find's.
  take(id: string): Station | undefined {
    const s = this.#offered?.id === id ? this.#offered : this.find(id)
    this.#offered = undefined
    return s
  }

  // My stations after a search added streams to some. New streams go at the
  // end, so this.stream still points at the one playing.
  searched(stations: Station[]): void {
    this.stations = stations
    const now = stations.find((s) => s.id === this.station?.id)
    if (now) {
      this.station = now
      this.#tell()
    }
  }

  // Picked but not playing: after a restart.
  select(station: Station, h: LiveHandle): void {
    this.#h = h
    this.pause()
    this.#show(station)
    this.#tell()
    this.stream = firstStream(station)
  }

  // Asks main for the station's streams, then gives the core a connection at
  // the live edge. Undefined when it can't play, or another play came meanwhile.
  async play(station: Station, h: LiveHandle): Promise<Playable | undefined> {
    this.#h = h
    const n = this.#start()
    this.#setStatus('connecting', 'Finding the streams')
    // the song or the last station stops now, not when main answers
    h.clear()
    const same = station.id === this.station?.id
    this.#show(station)
    this.#tell()
    let known: Station | undefined
    try {
      known = await window.radioApi.play($state.snapshot(station) as Station)
    } catch (e) {
      window.playbackApi.log(`Radio ${station.id}: radio:play failed: ${String(e)}`)
    }
    if (n !== this.#seq) return undefined
    if (!known) return this.#giveUp()
    this.station = known
    this.stations = this.stations.map((s) => (s.id === known.id ? known : s))
    this.#tell()
    // play again after a pause keeps the stream it had
    if (!same || !known.streams[this.stream]) this.stream = firstStream(known)
    if (this.stream < 0) return this.#giveUp()
    this.#setStatus('connecting', `Connecting to ${this.#streamLabel()}`)
    return this.#connection()
  }

  // Play after pause: a new connection at the live edge.
  async resume(): Promise<Playable | undefined> {
    return this.station && this.#h ? this.play(this.station, this.#h) : undefined
  }

  // Drops the connection, so nothing old plays after a long pause. Main ends
  // the stream; the core pauses the element and keeps its source: with no
  // source Chromium drops the system's media controls (MPRIS said Stopped and
  // Play did nothing).
  pause(): void {
    this.#seq++
    this.#wanted = false
    clearTimeout(this.#retryTimer)
    clearTimeout(this.#stallTimer)
    this.#setStatus('off', 'Stopped')
    this.#h?.stopped()
    window.radioApi.stop()
  }

  get wanted(): boolean {
    return this.#wanted
  }

  // Save: a station tried from search goes into My stations. The playing
  // one by default; the Radio view saves any result.
  async save(station: Station | undefined = this.station): Promise<void> {
    const s = station
    // a second click while main saves
    if (!s || this.stations.some((x) => x.id === s.id) || this.#saving.has(s.id)) return
    this.#saving.add(s.id)
    this.#tellActions()
    try {
      this.stations = await window.radioApi.save($state.snapshot(s) as Station)
    } catch (e) {
      window.playbackApi.log(`Radio ${s.id}: radio:save failed: ${String(e)}`)
      notice.show(`Couldn't save ${s.name}`)
    } finally {
      this.#saving.delete(s.id)
      this.#tellActions()
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
      return
    }
    // one click on a star removes it, so it can come back
    if (s) notice.show(`Removed ${s.name}`, { label: 'Undo', run: () => void this.#restore(s) })
  }

  async #restore(s: Station): Promise<void> {
    try {
      this.stations = await window.radioApi.restore(s.id)
    } catch (e) {
      window.playbackApi.log(`Radio ${s.id}: radio:restore failed: ${String(e)}`)
      notice.show(`Couldn't bring back ${s.name}`)
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
    this.#h?.clear()
    this.#setStatus('connecting', `Connecting to ${this.#streamLabel()}`)
    this.#h?.load(this.#connection())
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
    // an answer about the last connection must not act on this one
    this.#connects++
    return ++this.#seq
  }

  #show(station: Station): void {
    if (station.id === this.station?.id) return
    this.station = station
    this.title = ''
    this.history = []
    const id = station.id
    // Main adds a title to its file before it sends it, so its answer already
    // has any title heard while it was on the way.
    void window.radioApi.history(id).then(
      (h) => {
        if (this.station?.id !== id) return
        this.history = h
        this.#tell()
      },
      () => {}
    )
  }

  // What is on air, for Now Playing, the media session and the colors. Before
  // a song title comes the title is the station, so Now Playing doesn't say
  // it twice; the media controls' artist is always the station.
  #onAir(s: Station): ItemInfo {
    const track = this.now.track
    const on = { art: this.art, mediaArtist: s.name }
    return track
      ? { title: track, subtitle: s.name, names: [{ name: s.name, to: radioPage }], ...on }
      : { title: s.name, subtitle: 'Radio', titleTo: radioPage, ...on }
  }

  // The core hears what is on air and the recent songs after each change to
  // the station, its title or its history.
  #tell(): void {
    const s = this.station
    if (!this.#h || !s) return
    this.#h.info(this.#onAir(s))
    this.#h.history(historyEntries(this.history, this.title))
  }

  // The bar's actions: the stream picker, and Save while the station is not
  // in My stations (none once it is, as before). Reads stations, station,
  // stream and #saving: a new field read here must call #tellActions too.
  #actions(s: Station): Action[] {
    const list: Action[] = []
    const choices = streamChoices(s.streams)
    const picked = choices.find((c) => c.index === this.stream)
    if (choices.length) {
      list.push({
        id: 'stream',
        kind: 'choice',
        label: 'Stream',
        short: picked?.short ?? '',
        options: choices.map((c) => ({ id: String(c.index), label: c.label })),
        picked: picked ? String(picked.index) : ''
      })
    }
    if (!this.saved) {
      list.push({
        id: 'save',
        kind: 'button',
        label: 'Save',
        icon: 'star',
        hint: 'Add to My stations',
        busy: this.#saving.has(s.id)
      })
    }
    return list
  }

  #tellActions(): void {
    const s = this.station
    if (this.#h && s) this.#h.actions(this.#actions(s))
  }

  // `until`: when the waiting retry starts, so the bar's tooltip counts down
  #setStatus(status: RadioStatus, text: string, until?: number): void {
    // any change drops a BUFFERING still waiting to show
    clearTimeout(this.#bufferingTimer)
    this.status = status
    this.#h?.status(status === 'off' ? undefined : { state: status, text, until })
  }

  // "320 kbps mp3", as the stream picker names it
  #streamLabel(): string {
    const streams = this.station?.streams ?? []
    return streamChoices(streams).find((c) => c.index === this.stream)?.label ?? 'the stream'
  }

  // A new connection to the stream picked, at a new address.
  #connection(): Playable {
    this.#connects++
    this.#sound = false
    this.#down = false
    return {
      url: radioUrl(this.station!.id, this.stream, this.#connects),
      length: 'live',
      can: liveCan
    }
  }

  // The connection failed, ended or stalled. Before any sound, main is asked what
  // it answered: audio with no sound is a format Chromium can't play (next
  // stream at once); anything else is the network (the same stream, after a wait).
  #lost(why: string): void {
    if (!this.#wanted || this.#down) return
    this.#down = true
    this.#setStatus('reconnecting', 'Connection lost')
    clearTimeout(this.#retryTimer)
    clearTimeout(this.#stallTimer)
    // closes a stalled connection too
    this.#h?.clear()
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
    const ms = retryDelayMs(this.#reconnects++)
    const detail = `Retry ${this.#retries} of ${retriesPerStream} on ${this.#streamLabel()}`
    this.#setStatus('reconnecting', detail, Date.now() + ms)
    this.#retryTimer = setTimeout(() => {
      // the wait is over; it stays reconnecting until sound comes
      this.#setStatus('reconnecting', detail)
      this.#h?.load(this.#connection())
    }, ms)
  }

  #nextStream(): void {
    const s = this.station!
    this.#failed.add(this.stream)
    const next = nextStream(s.streams, this.stream, this.#failed)
    if (next < 0) return this.#giveUp()
    this.stream = next
    this.#retries = 0
    this.#setStatus('reconnecting', `Trying another stream: ${this.#streamLabel()}`)
    this.#h?.load(this.#connection())
  }

  #giveUp(): undefined {
    const name = this.station?.name ?? ''
    const format = this.#formatFailed.size > 0 && this.#formatFailed.size === this.#failed.size
    this.pause()
    notice.show(format ? `Format can't be played: ${name}` : `Station can't be reached: ${name}`)
    return undefined
  }

  #logo({ id, logo }: RadioLogo): void {
    this.#early?.set(id, logo)
    this.stations = this.stations.map((s) => (s.id === id ? withLogo(s, logo) : s))
    if (this.station?.id !== id) return
    this.station = withLogo(this.station, logo)
    this.#tell()
  }

  // Only for the title playing: an answer for one that changed since is dropped.
  #cover({ stationId, title, cover }: RadioCover): void {
    if (stationId !== this.station?.id || title !== this.title) return
    const last = this.history.at(-1)
    if (last?.title !== historyTitle(title)) return
    this.history = [...this.history.slice(0, -1), { ...last, cover }]
    this.#tell()
  }

  #heard(t: RadioTitle): void {
    if (t.stationId !== this.station?.id) return
    this.title = t.title
    this.history = addEntry(this.history, t.title, t.at)
    this.#tell()
  }
}

export const radio = new RadioStore()
