// Looks up covers online for albums with none, one album at a time, after
// each scan (ticket 014). Nothing is sent before main says the setting is on.
import type { FetchStatus } from '../../shared/library'
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
  // the results changed (save them); found: a new cover to show
  changed(found: boolean): void
  status(s: FetchStatus): void
  now(): number
  // resolves early when the signal aborts
  sleep(ms: number, signal: AbortSignal): Promise<void>
  log(text: string): void
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

const failed = Symbol('failed')

interface RunState {
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
  // aborted when turned off or held, so a wait or a request in flight ends
  #stop = new AbortController()
  #loop: Promise<void> = Promise.resolve()
  #running = false
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
    if (
      before &&
      coverSources.some((s) => sources[s] && !before[s]) &&
      dropNotFound(this.d.fetched)
    )
      this.d.changed(false)
    this.#on = on
    this.#sources = { ...sources }
    this.#restart()
  }

  // The albums with no cover of their own, after each build of the library.
  setQueries(queries: CoverQuery[]): void {
    this.#queries = queries
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

  // taken: albums looked up or being looked up in this run, so two loops never
  // take the same one, and a cover that is gone again at once (a full disk)
  // can't make the loop ask for it over and over
  #next(taken: Set<string>): CoverQuery | undefined {
    const now = this.d.now()
    const f = this.d.fetched
    return this.#queries.find(
      (q) => !taken.has(q.albumId) && !isFresh(f.get(q.albumId), q.key, now, this.d.hasCover)
    )
  }

  async #run(signal: AbortSignal): Promise<void> {
    if (!this.#on || this.#held || signal.aborted) return
    this.#running = true
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
        const q = this.#next(run.taken)
        if (!q) return
        run.taken.add(q.albumId)
        let out: Outcome
        try {
          out = await this.#find(q, signal)
        } catch (e) {
          if (signal.aborted) return
          // no service answered: most likely offline
          if (e instanceof NetError) {
            // looked up again after the wait
            run.taken.delete(q.albumId)
            await this.#offlineWait(run, e, signal)
            continue
          }
          throw e
        }
        if (signal.aborted) return
        if (out === 'later') continue
        const at = this.d.now()
        this.d.fetched.set(
          q.albumId,
          out === 'none'
            ? { source: 'none', at, key: q.key }
            : { hash: out.hash, source: out.source, at, key: q.key }
        )
        this.d.changed(out !== 'none')
        this.#report()
      }
    } catch (e) {
      if (!signal.aborted && !run.broken) this.d.log(`Covers online stopped: ${e}`)
      run.broken = true
    }
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

  // Each step on its own: a service that fails or is busy doesn't keep the
  // others from answering. Throws NetError when no service answered at all.
  async #find(q: CoverQuery, signal: AbortSignal): Promise<Outcome> {
    const s = this.#sources!
    let answered = 0
    let errors = 0
    const step = async <T>(f: () => Promise<T>): Promise<T | typeof failed> => {
      try {
        const r = await f()
        answered++
        return r
      } catch (e) {
        if (signal.aborted || !(e instanceof NetError || e instanceof BusyError)) throw e
        errors++
        return failed
      }
    }
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
          errors++
          continue
        }
        const found = pickCandidates(q, parseAnswer(source, json)).slice(0, triesPerSource)
        for (const c of found) {
          const limiter = source === 'musicbrainz' ? 'caa' : source
          const hash = await step(() => this.#take(c.image, limiter, signal))
          if (hash && hash !== failed) return { hash, source }
        }
      }
    if (errors && !answered) throw new NetError('no service answered')
    return errors ? 'later' : 'none'
  }

  #report(): void {
    const now = this.d.now()
    let found = 0
    let notFound = 0
    for (const q of this.#queries) {
      const e = this.d.fetched.get(q.albumId)
      if (!isFresh(e, q.key, now, this.d.hasCover)) continue
      if (e?.hash) found++
      else notFound++
    }
    const left = this.#queries.length - found - notFound
    this.d.status({ found, notFound, left, running: this.#running })
  }
}
