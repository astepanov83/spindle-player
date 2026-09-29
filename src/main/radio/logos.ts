// Station logos as covers (ticket 030). When a station is saved or played,
// main makes its logo into a cover in the cover cache, with a palette from the
// cover window, so the app colors, the stage and the media controls work as
// for an album. Main owns the station's `logo`; the page only shows it.
import { hash } from 'crypto'
import { sameLogo, smallLogoSide, type Station, type StationLogo } from '../../shared/stations'
import { paletteVersion, type ThemePalettes } from '../../shared/palette'
import { localAddress } from './logo-fetch'

// Metal Only's logo comes with the app (resources/metal-only.png), so the
// first start needs no request. It goes through the same steps as a fetched one.
export const metalOnlyLogo = 'bundled:metal-only'

// Where a station's logo comes from, or undefined when it has none.
export function logoSource(s: Station): string | undefined {
  if (s.logoUrl) return s.logoUrl
  return s.id === 'metal-only' ? metalOnlyLogo : undefined
}

// A station's homepage as a logo source: its icons (ticket 033). Kept as the
// logo's `from`, so a logo url that shows up later, or a new site, makes it again.
export const sitePrefix = 'site:'

// Where to look for a station's logo, best first: its logo address (or the
// one shipped), then the icons on its homepage, when the first is missing or
// fails this run.
export function logoSources(s: Station): string[] {
  const out: string[] = []
  const first = logoSource(s)
  if (first) out.push(first)
  if (s.site) out.push(sitePrefix + s.site)
  return out
}

// A station on the local network (its site or a stream there) may have its
// logo there too; for any other, local addresses are refused.
export function onLocalNetwork(s: Station): boolean {
  return localAddress(s.site) || s.streams.some((x) => localAddress(x.url))
}

// A station whose logo ships with the app and is not made yet (Metal Only on
// the first run): made at start from the file, with no request.
export function needsBundledLogo(s: Station): boolean {
  return !s.logo && logoSource(s) === metalOnlyLogo
}

// What this needs of CoverCache.
export interface LogoCache {
  addLogo(
    hash: string,
    data: Uint8Array
  ): Promise<{ palette: ThemePalettes; side: number } | undefined>
  hasLogo(hash: string, large: boolean): Promise<boolean>
  // new colors from the small cover, for colors picked by an older paletteVersion
  logoPalette(hash: string): Promise<ThemePalettes | undefined>
}

export interface LogoDeps {
  // the picture from a source (a web address, metalOnlyLogo or a sitePrefix
  // homepage) for this station; throws with the reason
  load(source: string, station: Station): Promise<Uint8Array>
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
  // hashes whose new colors could not be picked this run
  #repaintFailed = new Set<string>()

  constructor(readonly d: LogoDeps) {}

  keptThisRun(): Set<string> {
    return this.#kept
  }

  // The logo the station should have now, from its sources in order: the one
  // it has while its files are in the cache and it came from that source,
  // else one made from that source; if that fails, the next source. None
  // left: no logo. A logo with no `from` (made before it was kept) may be
  // from an older address, so it is made again from the logo address once;
  // if that fails it is kept while its files are there, before the homepage
  // is read: it came from the station's own logo, a homepage icon may not.
  async logoFor(station: Station): Promise<StationLogo | undefined> {
    const have = station.logo
    const legacy = async (): Promise<boolean> => !!have && !have.from && (await this.#has(have))
    for (const source of logoSources(station)) {
      if (source.startsWith(sitePrefix) && (await legacy())) return this.#withNewColors(have!)
      if (have?.from === source && (await this.#has(have))) return this.#withNewColors(have)
      const made = await this.#fromSource(source, station)
      if (made) return made
    }
    if (await legacy()) return this.#withNewColors(have!)
    return undefined
  }

  // Finds the logo behind the caller's answer, and hands it to `apply` when it changed.
  async update(
    station: Station,
    apply: (id: string, logo: StationLogo | undefined) => void
  ): Promise<void> {
    const logo = await this.logoFor(station)
    if (!sameLogo(logo, station.logo)) apply(station.id, logo)
  }

  // Colors picked by an older paletteVersion are picked again from the small
  // cover, with no new fetch. If that fails the old ones stay until the next run.
  async #withNewColors(logo: StationLogo): Promise<StationLogo> {
    if (logo.v === paletteVersion || this.#repaintFailed.has(logo.hash)) return logo
    const palette = await this.d.cache.logoPalette(logo.hash)
    if (!palette) {
      this.#repaintFailed.add(logo.hash)
      return logo
    }
    return { ...logo, palette, v: paletteVersion }
  }

  async #has(logo: StationLogo): Promise<boolean> {
    if (!(await this.d.cache.hasLogo(logo.hash, !logo.small))) return false
    this.#keep(logo.hash)
    return true
  }

  // Made once per source per run; the first station to ask decides whether a
  // local address may be asked.
  async #fromSource(source: string, station: Station): Promise<StationLogo | undefined> {
    const made = this.#made.get(source)
    if (made && (await this.#has(made))) return made
    if (this.#failed.has(source)) return undefined
    let job = this.#busy.get(source)
    if (!job) {
      job = this.#make(source, station).finally(() => this.#busy.delete(source))
      this.#busy.set(source, job)
    }
    return job
  }

  async #make(source: string, station: Station): Promise<StationLogo | undefined> {
    let data: Uint8Array
    try {
      data = await this.d.load(source, station)
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
    logo.from = source
    logo.v = paletteVersion
    this.#made.set(source, logo)
    return logo
  }

  #keep(h: string): void {
    if (this.#kept.has(h)) return
    this.#kept.add(h)
    this.d.kept()
  }
}
