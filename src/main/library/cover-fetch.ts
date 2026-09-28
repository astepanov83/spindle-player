// Looks up covers online for albums with none, a few albums at a time, after
// each scan (ticket 014), then artist photos from Deezer (ticket 021).
// Nothing is sent before main says the setting is on.
import type { FetchCounts, FetchStatus } from '../../shared/library'
import {
  artistCandidates,
  artistSearchUrl,
  checkedArtist,
  checkUrl,
  type ArtistQuery
} from './artist-photo'
import { coverSources, type CoverSource } from '../../shared/settings'
import { BusyError, NetError, type CoverHttp } from './cover-http'
import { pickCandidates, type CoverQuery } from './cover-match'
import { answerError, caaGroupUrl, caaReleaseUrl, parseAnswer, searchUrl } from './cover-sources'
import { dropNotFound, isFresh, type Fetched } from './fetched-store'

export interface FetcherDeps {
  http: Pick<CoverHttp, 'json' | 'image'>
  // puts a picture in the cover cache; ok once it is decoded and cached
  addCover(data: Uint8Array): Promise<{ hash: string; ok: boolean }>
  hasCover(hash: string): boolean
  fetched: Fetched
  // artist photos, by artist key
  photos: Fetched
  // the results changed (save them); found: a new cover to show
  changed(found: boolean): void
  status(s: FetchStatus): void
  now(): number
  // resolves early when the signal aborts
  sleep(ms: number, signal: AbortSignal): Promise<void>
  log(text: string): void
}

// How often the page gets the library while covers come in. Each time it is
// the whole library (several MB for 40k songs), so less often in a big one.
export function publishGapMs(tracks: number): number {
  return Math.min(10000, Math.max(2000, Math.round(tracks / 4)))
}

// no connection: look again after this long
const offlineWaitMs = 5 * 60 * 1000
// matching results downloaded per source before going on to the next source
const triesPerSource = 3
// albums looked up at once; each service's limiter still spaces its requests,
// so this only fills the time spent waiting for answers
const albumsAtOnce = 5

// later: a service failed and the others found nothing; stored as nothing,
// so the next run asks again
type Outcome = { hash: string; source: CoverSource } | 'none' | 'later'

// What a loop looks up next: an album's cover, or an artist's photo.
type Job = { album: CoverQuery; artist?: never } | { artist: ArtistQuery; album?: never }

const failed = Symbol('failed')

interface RunState {
  // "al:<album id>" and "ar:<artist key>"
  taken: Set<string>
  // the 5 minute wait after no service answered, shared by the loops
  offline: Promise<void> | undefined
  // an error that is not the network's: every loop stops
  broken: boolean
}

export class CoverFetcher {
  #on = false
  // held until the first scan ends, and while any scan runs
  #held = true
  // none until main first said, so the first setting drops no misses
  #sources: Record<CoverSource, boolean> | undefined
  #queries: CoverQuery[] = []
  #artists: ArtistQuery[] = []
  // aborted when turned off or held, so a wait or a request in flight ends
  #stop = new AbortController()
  #loop: Promise<void> = Promise.resolve()
  #running = false
  // what the loops look up now, for the spinner; kept through the offline wait
  #phase: 'covers' | 'photos' = 'covers'
  #inFlight = { covers: 0, photos: 0 }
  // pictures that were not there (a 404), not asked for again while the app
  // runs, so a retried album doesn't repeat them
  #missing = new Set<string>()

  constructor(readonly d: FetcherDeps) {}

  // Resolves when the loop has stopped or has nothing left to do.
  get idle(): Promise<void> {
    return this.#loop
  }

  setOptions(on: boolean, sources: Record<CoverSource, boolean>): void {
    const before = this.#sources
    // a source turned on may find what the others did not
    if (before && coverSources.some((s) => sources[s] && !before[s])) {
      // artist photos come from Deezer only
      const photos = sources.deezer && !before.deezer && dropNotFound(this.d.photos)
      if (dropNotFound(this.d.fetched) || photos) this.d.changed(false)
    }
    this.#on = on
    this.#sources = { ...sources }
    this.#restart()
  }

  // The albums with no cover of their own, and the artists, after each build
  // of the library.
  setQueries(queries: CoverQuery[], artists: ArtistQuery[] = []): void {
    this.#queries = queries
    this.#artists = artists
    this.#report()
    // a running loop picks the new list up for its next album
    if (!this.#running) this.#restart()
  }

  hold(): void {
    this.#held = true
    this.#restart()
  }

  release(): void {
    this.#held = false
    this.#restart()
  }

  #restart(): void {
    this.#stop.abort()
    this.#stop = new AbortController()
    const signal = this.#stop.signal
    this.#loop = this.#loop.then(() => this.#run(signal))
  }

  // Albums first, then artists: a cover shows in more places than a photo.
  // taken: albums and artists looked up or being looked up in this run, so
  // two loops never take the same one, and a cover that is gone again at once
  // (a full disk) can't make the loop ask for it over and over
  #next(taken: Set<string>): { job: Job; id: string } | undefined {
    const now = this.d.now()
    const f = this.d.fetched
    const album = this.#queries.find(
      (q) =>
        !taken.has('al:' + q.albumId) && !isFresh(f.get(q.albumId), q.key, now, this.d.hasCover)
    )
    if (album) return { job: { album }, id: 'al:' + album.albumId }
    if (!this.#sources?.deezer) return undefined
    const p = this.d.photos
    const artist = this.#artists.find(
      (a) => !taken.has('ar:' + a.id) && !isFresh(p.get(a.id), a.key, now, this.d.hasCover)
    )
    return artist && { job: { artist }, id: 'ar:' + artist.id }
  }

  async #run(signal: AbortSignal): Promise<void> {
    if (!this.#on || this.#held || signal.aborted) return
    this.#running = true
    this.#phase = 'covers'
    this.#report()
    const run: RunState = { taken: new Set(), offline: undefined, broken: false }
    try {
      await Promise.all(Array.from({ length: albumsAtOnce }, () => this.#takeAlbums(run, signal)))
    } finally {
      this.#running = false
      this.#report()
    }
  }

  // One of the loops of a run: takes the next album until none is left.
  async #takeAlbums(run: RunState, signal: AbortSignal): Promise<void> {
    try {
      for (;;) {
        // no new album goes out while another loop waits out being offline
        while (run.offline) await run.offline
        if (signal.aborted || run.broken) return
        const next = this.#next(run.taken)
        if (!next) return
        const { job, id } = next
        run.taken.add(id)
        let out: Outcome
        const kind = job.album ? 'covers' : 'photos'
        this.#working(kind, 1)
        try {
          out = job.album
            ? await this.#find(job.album, signal)
            : await this.#photo(job.artist, signal)
        } catch (e) {
          if (signal.aborted) return
          // no service answered: most likely offline
          if (e instanceof NetError) {
            // looked up again after the wait
            run.taken.delete(id)
            await this.#offlineWait(run, e, signal)
            continue
          }
          throw e
        } finally {
          this.#working(kind, -1)
        }
        if (signal.aborted) return
        if (out === 'later') continue
        const at = this.d.now()
        const key = job.album ? job.album.key : job.artist.key
        ;(job.album ? this.d.fetched : this.d.photos).set(
          job.album ? job.album.albumId : job.artist.id,
          out === 'none'
            ? { source: 'none', at, key }
            : { hash: out.hash, source: out.source, at, key }
        )
        this.d.changed(out !== 'none')
        this.#report()
      }
    } catch (e) {
      if (!signal.aborted && !run.broken) this.d.log(`Covers online stopped: ${e}`)
      run.broken = true
    }
  }

  // An album left for later keeps no loop on covers, so the spinner moves
  // to photos once no loop looks up an album.
  #working(kind: 'covers' | 'photos', by: 1 | -1): void {
    this.#inFlight[kind] += by
    const { covers, photos } = this.#inFlight
    const phase = covers ? 'covers' : photos ? 'photos' : this.#phase
    if (phase === this.#phase) return
    this.#phase = phase
    this.#report()
  }

  // One wait for all loops of the run, so being offline logs once.
  #offlineWait(run: RunState, e: NetError, signal: AbortSignal): Promise<void> {
    if (!run.offline) {
      this.d.log(`Covers online: ${e.message}; looking again in 5 minutes`)
      run.offline = this.d.sleep(offlineWaitMs, signal).finally(() => (run.offline = undefined))
    }
    return run.offline
  }

  // Downloads a picture and puts it in the cache; undefined if it doesn't decode.
  async #take(
    url: string,
    limiter: 'caa' | 'deezer' | 'itunes',
    signal: AbortSignal
  ): Promise<string | undefined> {
    if (this.#missing.has(url)) return undefined
    const img = await this.d.http.image(url, limiter, signal)
    if (signal.aborted) return undefined
    if (!img) {
      this.#missing.add(url)
      return undefined
    }
    const r = await this.d.addCover(img)
    return r.ok ? r.hash : undefined
  }

  // Runs requests one step at a time and counts which answered, so a service
  // that fails or is busy doesn't keep the others from answering.
  #steps(signal: AbortSignal): {
    step: <T>(f: () => Promise<T>) => Promise<T | typeof failed>
    error: () => void
    // throws NetError when no service answered and none was only busy
    outcome: () => 'none' | 'later'
  } {
    let answered = 0
    let errors = 0
    // a busy service is online: one 429 must not start the 5 minute wait
    let busy = 0
    return {
      step: async (f) => {
        try {
          const r = await f()
          answered++
          return r
        } catch (e) {
          if (signal.aborted || !(e instanceof NetError || e instanceof BusyError)) throw e
          if (e instanceof BusyError) busy++
          errors++
          return failed
        }
      },
      error: () => void errors++,
      outcome: () => {
        if (errors && !answered && !busy) throw new NetError('no service answered')
        return errors ? 'later' : 'none'
      }
    }
  }

  async #find(q: CoverQuery, signal: AbortSignal): Promise<Outcome> {
    const s = this.#sources!
    const { step, error, outcome } = this.#steps(signal)
    if (s.musicbrainz)
      for (const url of [
        q.mbReleaseGroup && caaGroupUrl(q.mbReleaseGroup),
        q.mbRelease && caaReleaseUrl(q.mbRelease)
      ]) {
        if (!url) continue
        const hash = await step(() => this.#take(url, 'caa', signal))
        if (hash && hash !== failed) return { hash, source: 'musicbrainz' }
      }
    // an album name alone matches too many wrong records
    if (!q.noArtist)
      for (const source of ['deezer', 'itunes', 'musicbrainz'] as const) {
        if (!s[source]) continue
        const json = await step(() => this.d.http.json(searchUrl(source, q), source, signal))
        if (json === failed) continue
        if (answerError(source, json)) {
          error()
          continue
        }
        const found = pickCandidates(q, parseAnswer(source, json)).slice(0, triesPerSource)
        for (const c of found) {
          const limiter = source === 'musicbrainz' ? 'caa' : source
          const hash = await step(() => this.#take(c.image, limiter, signal))
          if (hash && hash !== failed) return { hash, source }
        }
      }
    return outcome()
  }

  // An artist's photo from Deezer: the artists with the same name, then one
  // of their albums or songs to tell which of them it is.
  async #photo(a: ArtistQuery, signal: AbortSignal): Promise<Outcome> {
    const { step, error, outcome } = this.#steps(signal)
    const json = await step(() => this.d.http.json(artistSearchUrl(a.name), 'deezer', signal))
    if (json === failed) return outcome()
    if (answerError('deezer', json)) {
      error()
      return outcome()
    }
    const candidates = artistCandidates(json, a.name)
    if (!candidates.length) return 'none'
    for (const c of a.checks) {
      const found = await step(() => this.d.http.json(checkUrl(a.name, c), 'deezer', signal))
      if (found === failed) continue
      if (answerError('deezer', found)) {
        error()
        continue
      }
      const artist = checkedArtist(found, c, candidates)
      if (!artist) continue
      const hash = await step(() => this.#take(artist.image, 'deezer', signal))
      if (hash && hash !== failed) return { hash, source: 'deezer' }
      // the picture was not there or did not decode: nothing else to try
      return outcome()
    }
    return outcome()
  }

  #counts(items: { id: string; key: string }[], f: Fetched): FetchCounts {
    const now = this.d.now()
    let found = 0
    let notFound = 0
    for (const q of items) {
      const e = f.get(q.id)
      if (!isFresh(e, q.key, now, this.d.hasCover)) continue
      if (e?.hash) found++
      else notFound++
    }
    return { found, notFound, left: items.length - found - notFound }
  }

  #report(): void {
    const albums = this.#counts(
      this.#queries.map((q) => ({ id: q.albumId, key: q.key })),
      this.d.fetched
    )
    const s: FetchStatus = { ...albums, running: this.#running }
    if (this.#running) s.phase = this.#phase
    // artist photos are looked up only with Deezer on
    if (this.#sources?.deezer) s.artists = this.#counts(this.#artists, this.d.photos)
    this.d.status(s)
  }
}
