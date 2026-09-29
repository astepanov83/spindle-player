// Station logos as covers (ticket 030). When a station is saved or played,
// main makes its logo into a cover in the cover cache, with a palette from the
// cover window, so the app colors, the stage and the media controls work as
// for an album. Main owns the station's `logo`; the page only shows it.
import { hash } from 'crypto'
import { sameLogo, smallLogoSide, type Station, type StationLogo } from '../../shared/stations'
import type { ThemePalettes } from '../../shared/palette'

// Metal Only's logo comes with the app (resources/metal-only.png), so the
// first start needs no request. It goes through the same steps as a fetched one.
export const metalOnlyLogo = 'bundled:metal-only'

// Where a station's logo comes from, or undefined when it has none.
export function logoSource(s: Station): string | undefined {
  if (s.logoUrl) return s.logoUrl
  return s.id === 'metal-only' ? metalOnlyLogo : undefined
}

// What this needs of CoverCache.
export interface LogoCache {
  addLogo(
    hash: string,
    data: Uint8Array
  ): Promise<{ palette: ThemePalettes; side: number } | undefined>
  hasLogo(hash: string, large: boolean): Promise<boolean>
}

export interface LogoDeps {
  // the picture from a source (a web address or metalOnlyLogo); throws with the reason
  load(source: string): Promise<Uint8Array>
  cache: LogoCache
  // keptThisRun() grew: the cover prune must hear of it before the files are written
  kept(): void
  log(text: string): void
}

// The covers the prune must keep: saved stations' logos, and every logo made
// or seen this run (a station from search that plays has one too).
export function keptLogos(saved: Station[], run: Set<string>): string[] {
  const out = new Set(run)
  for (const s of saved) if (s.logo) out.add(s.logo.hash)
  return [...out]
}

export class StationLogos {
  // by source, made this run
  #made = new Map<string, StationLogo>()
  // sources that failed this run; tried again on the next run
  #failed = new Set<string>()
  #busy = new Map<string, Promise<StationLogo | undefined>>()
  #kept = new Set<string>()

  constructor(readonly d: LogoDeps) {}

  keptThisRun(): Set<string> {
    return this.#kept
  }

  // The logo the station should have now: the one it has while its files are
  // in the cache, else one made from its source, else none.
  async logoFor(station: Station): Promise<StationLogo | undefined> {
    const have = station.logo
    if (have && (await this.#has(have))) return have
    const source = logoSource(station)
    return source ? this.#fromSource(source) : undefined
  }

  // Finds the logo behind the caller's answer, and hands it to `apply` when it changed.
  async update(
    station: Station,
    apply: (id: string, logo: StationLogo | undefined) => void
  ): Promise<void> {
    const logo = await this.logoFor(station)
    if (!sameLogo(logo, station.logo)) apply(station.id, logo)
  }

  async #has(logo: StationLogo): Promise<boolean> {
    if (!(await this.d.cache.hasLogo(logo.hash, !logo.small))) return false
    this.#keep(logo.hash)
    return true
  }

  async #fromSource(source: string): Promise<StationLogo | undefined> {
    const made = this.#made.get(source)
    if (made && (await this.#has(made))) return made
    if (this.#failed.has(source)) return undefined
    let job = this.#busy.get(source)
    if (!job) {
      job = this.#make(source).finally(() => this.#busy.delete(source))
      this.#busy.set(source, job)
    }
    return job
  }

  async #make(source: string): Promise<StationLogo | undefined> {
    let data: Uint8Array
    try {
      data = await this.d.load(source)
    } catch (e) {
      this.#failed.add(source)
      this.d.log(`Could not fetch a station logo from ${source}: ${String(e)}`)
      return undefined
    }
    const h = hash('sha1', data)
    // before the files exist, so a prune running now does not take them
    this.#keep(h)
    const done = await this.d.cache.addLogo(h, data)
    if (!done) {
      this.#failed.add(source)
      this.d.log(`Could not make a station logo from ${source}`)
      return undefined
    }
    const logo: StationLogo = { hash: h, palette: done.palette }
    if (done.side < smallLogoSide) logo.small = true
    this.#made.set(source, logo)
    return logo
  }

  #keep(h: string): void {
    if (this.#kept.has(h)) return
    this.#kept.add(h)
    this.d.kept()
  }
}
