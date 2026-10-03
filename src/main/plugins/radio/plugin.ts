// Radio: stations, logos, song covers, Radio Browser, the stream request and
// the page's radio requests. Off means no network and no file changes; the
// handlers stay and answer "off" (spec "What off means").
import { join } from 'path'
import { RadioChannel, type RadioCover, type RadioLogo, type RadioTitle } from '../../../shared/ipc'
import type { PluginId } from '../../../shared/plugins'
import { parseStation, type Station, type StationLogo } from '../../../shared/stations'
import { notFound } from '../../library/protocol'
import type { MainPlugin, PluginContext } from '../types'
import { checkedFetch } from './checked-fetch'
import { findStreams } from './find-streams'
import { fetchLogo } from './logo-fetch'
import {
  keptLogos,
  metalOnlyLogo,
  needsBundledLogo,
  onLocalNetwork,
  sitePrefix,
  LoadSkipped,
  StationLogos
} from './logos'
import { PlayedStations } from './play'
import { RadioBrowser, resolveMirrors } from './radio-browser'
import { ResultLogos } from './result-logos'
import { fetchSiteLogo } from './site-icons'
import { foundHashes, openSongCovers, SongCovers } from './song-covers'
import { RadioHistoryStore, StationsStore } from './stations-store'
import { RadioStreams, radioStream } from './stream'

// Everything below is made in start, once the page's services are there.
interface Parts {
  played: PlayedStations
  logos: StationLogos
  songCovers: SongCovers
  radioBrowser: RadioBrowser
  resultLogos: ResultLogos
  setLogo(id: string, logo: StationLogo | undefined): void
}

export class RadioPlugin implements MainPlugin {
  readonly id: PluginId = 'radio'
  // My stations and the heard titles
  readonly stations: StationsStore
  readonly history: RadioHistoryStore
  // opened here, not in start: the library's first prune asks for these covers
  readonly #songFile: ReturnType<typeof openSongCovers>
  readonly #streams = new RadioStreams()
  #parts: Parts | undefined
  #on = false
  // counts searches, so only the newest one's rows get logos
  #searches = 0

  constructor(
    userData: string,
    private readonly o: {
      log(text: string): void
      // the logo that ships with the app
      bundledLogo(): Promise<Uint8Array>
      now?: () => number
    }
  ) {
    this.stations = new StationsStore(join(userData, 'stations.json'))
    this.history = new RadioHistoryStore(
      join(userData, 'radio-history.json'),
      (id) => !!this.stations.get(id)
    )
    this.#songFile = openSongCovers(
      join(userData, 'radio-covers.json'),
      this.history.titles(),
      (o.now ?? Date.now)(),
      o.log
    )
  }

  start(ctx: PluginContext): void {
    const { page, toPage, covers, settings, log, userAgent } = ctx
    const { stations, history } = this
    const radioFetch = ctx.fetch
    // logos, homepages and finding streams: each redirect checked, local
    // addresses only for a local station
    const logoFetch = (privateOk: boolean): typeof fetch => checkedFetch(ctx.request, privateOk)

    // A logo main made or dropped: into My stations (stations.json) for a saved
    // station, into the copy kept for one from search, and to the page.
    const setLogo = (id: string, logo: StationLogo | undefined): void => {
      // a fetch that was already running when radio went off
      if (!this.#on) return
      stations.setLogo(id, logo)
      played.setLogo(id, logo)
      toPage(RadioChannel.logo, { id, logo } satisfies RadioLogo)
      covers.kept()
    }

    const fetchSource = async (source: string, station: Station): Promise<Uint8Array> => {
      if (source === metalOnlyLogo) return this.o.bundledLogo()
      const privateOk = onLocalNetwork(station)
      const o = { fetch: logoFetch(privateOk), userAgent, privateOk }
      // a station with no logo, or one that failed: its homepage's icons (ticket 033)
      if (source.startsWith(sitePrefix)) return fetchSiteLogo(source.slice(sitePrefix.length), o)
      return fetchLogo(source, o)
    }

    const played = new PlayedStations(
      stations,
      (station) => {
        const privateOk = onLocalNetwork(station)
        return findStreams(station, {
          fetch: logoFetch(privateOk),
          log,
          userAgent,
          privateOk
        })
      },
      log,
      // not waited for: the stream matters more than the picture
      (station) => void logos.update(station, setLogo),
      () => this.#on
    )
    const logos = new StationLogos({
      load: async (source, station) => {
        // not a failure: asked again once radio is on
        if (!this.#on) throw new LoadSkipped('radio is off')
        const data = await fetchSource(source, station)
        // it came back after radio went off: no picture is made, no file written
        if (!this.#on) throw new LoadSkipped('radio is off')
        return data
      },
      cache: covers.get().cache,
      kept: () => covers.kept(),
      log
    })
    const songCovers = new SongCovers({
      // live: with settings.json unreadable, the page's choice still counts this run
      setting: () => ({
        on: settings.live().fetchCovers,
        sources: settings.live().coverSources
      }),
      find: (q, signal) => covers.get().song(q, signal),
      cache: covers.get().cache,
      map: this.#songFile.map,
      save: this.#songFile.save,
      kept: () => covers.kept(),
      send: (c) => toPage(RadioChannel.cover, c satisfies RadioCover),
      log,
      now: this.o.now ?? Date.now
    })
    const radioBrowser = new RadioBrowser({
      fetch: radioFetch,
      mirrors: () => resolveMirrors(ctx.dns),
      userAgent,
      log,
      // a saved or played station keeps its id in search results
      known: (id) => !!played.lookup(id)
    })
    const resultLogos = new ResultLogos({
      load: (url, signal) => fetchLogo(url, { fetch: logoFetch(false), userAgent, signal }),
      log
    })
    this.#parts = { played, logos, songCovers, radioBrowser, resultLogos, setLogo }
    const streams = this.#streams

    const radioRequest = (id: string, stream: string | null): Promise<Response> =>
      radioStream(id, stream, {
        lookup: (id) => played.lookup(id),
        fetch: radioFetch,
        onTitle: (stationId, title) => {
          if (!this.#on) return
          const at = Date.now()
          // kept for any station played, not only saved ones
          history.add(stationId, title, at)
          toPage(RadioChannel.title, { stationId, title, at } satisfies RadioTitle)
          // after the title, so the page has it when the cover comes
          songCovers.heard(stationId, title, played.lookup(stationId)?.name ?? '')
        },
        log,
        streams,
        userAgent,
        // the first stream to answer with audio after a play counts a Radio Browser click
        opened: (stationId, url) => void radioBrowser.opened(stationId, url)
      })
    ctx.route('radio', (_req, url, parts) =>
      this.#on && parts.length === 1
        ? radioRequest(parts[0], url.searchParams.get('stream'))
        : notFound()
    )
    ctx.route('radio-logo', async (_req, _url, parts) => {
      const logo = this.#on && parts.length === 1 ? await resultLogos.get(parts[0]) : undefined
      if (!logo) return notFound()
      return new Response(new Uint8Array(logo.data), {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': logo.type,
          'X-Content-Type-Options': 'nosniff'
        }
      })
    })

    page.handle(RadioChannel.stations, () => stations.list())
    page.handle(RadioChannel.save, (_, raw) => {
      if (!this.#on) return stations.list()
      // A station played from search brings the logo, the streams and the choice
      // main has for it: the page's copy is from before the server answered.
      const list = stations.save(played.forSave(raw), (id) => played.lookup(id)?.logo)
      const saved = stations.get(parseStation(raw)?.id ?? '')
      // behind the answer; the page hears of the logo with radio:logo
      if (saved) void logos.update(saved, setLogo)
      covers.kept()
      return list
    })
    page.handle(RadioChannel.remove, (_, id) => {
      if (!this.#on) return stations.list()
      const list = stations.remove(id)
      covers.kept()
      return list
    })
    page.handle(RadioChannel.restore, (_, id) => {
      if (!this.#on) return stations.list()
      const list = stations.restore(id)
      covers.kept()
      return list
    })
    page.handle(RadioChannel.move, (_, id, by) =>
      this.#on ? stations.move(id, by) : stations.list()
    )
    page.handle(RadioChannel.choose, (_, id, url) => {
      if (!this.#on) return stations.list()
      // a station from search keeps it on main's copy
      if (typeof id === 'string' && typeof url === 'string') played.choose(id, url)
      return stations.choose(id, url)
    })
    // with the covers found for its songs, for the recent songs' rows
    page.handle(RadioChannel.history, (_, id) =>
      typeof id === 'string'
        ? history.get(id).map((e) => {
            const cover = songCovers.known(e.title)
            return cover ? { ...e, cover } : e
          })
        : []
    )
    page.handle(RadioChannel.play, async (_, station) => {
      if (!this.#on) return undefined
      const known = await played.play(station)
      // the click is counted when a stream opens, behind the answer
      if (known) radioBrowser.played(known.id)
      return known
    })
    page.handle(RadioChannel.search, async (_, q) => {
      if (!this.#on) return { ok: false }
      if (typeof q !== 'string') return { ok: true, stations: [] }
      const n = ++this.#searches
      const found = await radioBrowser.search(q)
      if (!found.ok) return found
      // the answer may come after radio went off
      if (!this.#on) return { ok: false }
      if (n === this.#searches) resultLogos.searched(found.stations)
      return played.searched(found.stations) ? { ...found, saved: stations.list() } : found
    })
    // always allowed: it only ends a connection
    page.on(RadioChannel.stop, () => this.#stop())
    page.handle(RadioChannel.lastAnswer, (_, id) =>
      typeof id === 'string' ? streams.lastAnswer(id) : undefined
    )
  }

  // Called with the saved value at start, then on each change.
  setOn(on: boolean): void {
    if (on === this.#on) return
    this.#on = on
    const parts = this.#parts
    if (!on) {
      this.#stop()
      // the rows of the search before it get no logos
      this.#searches++
      parts?.resultLogos.clear()
      return
    }
    if (!parts) return
    // the setting may have changed while off, when the call was skipped
    parts.songCovers.settingChanged()
    // Metal Only's logo ships with the app: made from the file, so My stations
    // shows it before it is played (no request)
    for (const s of this.stations.list()) {
      if (needsBundledLogo(s)) void parts.logos.update(s, parts.setLogo)
    }
  }

  #stop(): void {
    this.#streams.stop()
    // a new connection sends its title again
    this.#parts?.songCovers.stopped()
  }

  keptCovers(): string[] {
    const parts = this.#parts
    return [
      ...keptLogos(this.stations.list(), parts ? parts.logos.keptThisRun() : new Set()),
      ...(parts ? parts.songCovers.hashes() : foundHashes(this.#songFile.map))
    ]
  }

  coverSettingChanged(): void {
    // the new setting only matters while radio is on
    if (this.#on) this.#parts?.songCovers.settingChanged()
  }

  flushSync(): void {
    this.stations.flushSync()
    this.history.flushSync()
    this.#songFile.flushSync()
  }
}
