// Logos of Radio Browser search results (ticket 029), served to the page as
// spindle://radio-logo/<station id>: the page's img-src stays closed to the web.
// The rows' images load lazily, so only rows on screen ask. Main fetches a few
// at a time (with 030's fetchLogo, which refuses what is not a picture or is
// too big) into a short-lived cache in memory. Nothing goes to the cover cache:
// a logo becomes a cover only when its station is saved or played (030).
import type { Station } from '../../shared/stations'
import { pictureType } from './logo-fetch'

export interface ResultLogosDeps {
  // the picture's bytes, or throws with the reason
  load(url: string, signal: AbortSignal): Promise<Uint8Array>
  log(text: string): void
  now?: () => number
  // bytes kept in all
  maxBytes?: number
}

export interface ResultLogo {
  data: Uint8Array
  type: string
}

const keepMs = 10 * 60_000
const maxBytes = 32 * 1024 * 1024
const atOnce = 4
// station ids kept from searches; a search adds up to 200
const maxSources = 2000

// The picture types fetchLogo lets through.
export const logoType = (b: Uint8Array): string => pictureType(b) ?? 'image/x-icon'

interface Kept {
  at: number
  // none: the fetch failed, and is not tried again while this is kept
  logo?: ResultLogo
}

export class ResultLogos {
  // station id -> logo address, from searches this run
  #source = new Map<string, string>()
  // the stations of the newest search: rows of an older one are gone
  #latest = new Set<string>()
  // by logo address, oldest first
  #kept = new Map<string, Kept>()
  #bytes = 0
  #busy = new Map<string, Promise<ResultLogo | undefined>>()
  #running = 0
  #waiting: { id: string; start: () => void; drop: () => void }[] = []

  constructor(readonly d: ResultLogosDeps) {}

  // The stations of a search the page is about to show.
  searched(stations: Station[]): void {
    if (this.#source.size > maxSources) this.#source.clear()
    this.#latest = new Set()
    for (const s of stations) {
      this.#latest.add(s.id)
      if (s.logoUrl) this.#source.set(s.id, s.logoUrl)
    }
    // rows that are gone never ask again
    this.#waiting = this.#waiting.filter((w) => this.#latest.has(w.id) || (w.drop(), false))
  }

  // The logo of a station from search, or undefined for none.
  async get(id: string): Promise<ResultLogo | undefined> {
    // rows of an older search are gone; the page can't ask for any station
    const url = this.#latest.has(id) ? this.#source.get(id) : undefined
    if (!url) return undefined
    const now = (this.d.now ?? Date.now)()
    const kept = this.#kept.get(url)
    if (kept && now - kept.at < keepMs) return kept.logo
    if (kept) this.#forget(url)
    let job = this.#busy.get(url)
    if (!job) {
      job = this.#fetch(id, url).finally(() => this.#busy.delete(url))
      this.#busy.set(url, job)
    }
    return job
  }

  async #fetch(id: string, url: string): Promise<ResultLogo | undefined> {
    if (!(await this.#turn(id))) return undefined
    let logo: ResultLogo | undefined
    try {
      const data = await this.d.load(url, AbortSignal.timeout(10000))
      logo = { data, type: logoType(data) }
    } catch (e) {
      this.d.log(`Could not fetch a search result's logo from ${url}: ${String(e)}`)
    } finally {
      this.#running--
      this.#next()
    }
    this.#keep(url, logo)
    return logo
  }

  // Resolves true when a slot is free, false when the row is gone first.
  #turn(id: string): Promise<boolean> {
    if (this.#running < atOnce) {
      this.#running++
      return Promise.resolve(true)
    }
    return new Promise((ok) =>
      this.#waiting.push({
        id,
        start: () => ok(true),
        drop: () => ok(false)
      })
    )
  }

  #next(): void {
    const w = this.#waiting.shift()
    if (!w) return
    this.#running++
    w.start()
  }

  // bytes kept now
  get bytes(): number {
    return this.#bytes
  }

  #keep(url: string, logo: ResultLogo | undefined): void {
    const now = (this.d.now ?? Date.now)()
    // oldest first: the expired ones are at the front
    for (const [k, v] of this.#kept) {
      if (now - v.at < keepMs) break
      this.#forget(k)
    }
    this.#kept.set(url, { at: now, logo })
    this.#bytes += logo?.data.length ?? 0
    const limit = this.d.maxBytes ?? maxBytes
    for (const k of this.#kept.keys()) {
      if (this.#bytes <= limit) break
      this.#forget(k)
    }
  }

  #forget(url: string): void {
    this.#bytes -= this.#kept.get(url)?.logo?.data.length ?? 0
    this.#kept.delete(url)
  }
}
