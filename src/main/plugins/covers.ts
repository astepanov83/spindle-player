import { hash } from 'crypto'
import { paletteVersion, type ThemePalettes } from '../../shared/palette'
import { smallLogoSide } from '../../shared/stations'
import type { CoverProvider, CoverService } from './types'

// Holds the cover service the files plugin gives, for plugins that start after it.
export class Covers implements CoverProvider {
  #service: CoverService | undefined

  provide(service: CoverService): void {
    this.#service = service
  }

  get(): CoverService {
    if (!this.#service) throw new Error('No plugin has provided the cover service yet')
    return this.#service
  }

  kept(): void {
    this.#service?.kept()
  }
}

// What a plugin needs of CoverCache to put a picture in it.
export interface LogoCache {
  addLogo(
    hash: string,
    data: Uint8Array
  ): Promise<{ palette: ThemePalettes; side: number } | undefined>
  hasLogo(hash: string, large: boolean): Promise<boolean>
  // new colors from the small cover, for colors picked by an older paletteVersion
  logoPalette(hash: string): Promise<ThemePalettes | undefined>
}

// A picture made into the cover cache: its hash, colors, small below
// smallLogoSide, and the paletteVersion that picked the colors.
export interface MadeCover {
  hash: string
  palette: ThemePalettes
  small?: boolean
  v: number
}

// Makes a picture into the cover cache with its colors, for a station logo,
// a song cover or MFP's picture. `keep` hears the hash before the files exist, so a prune
// running now does not take them. Undefined when the cover window failed.
export async function makeCover(
  cache: LogoCache,
  data: Uint8Array,
  keep: (hash: string) => void
): Promise<MadeCover | undefined> {
  const h = hash('sha1', data)
  keep(h)
  const done = await cache.addLogo(h, data)
  if (!done) return undefined
  const out: MadeCover = { hash: h, palette: done.palette, v: paletteVersion }
  if (done.side < smallLogoSide) out.small = true
  return out
}

// Colors picked by an older paletteVersion, picked again from the small cover
// with no new fetch. The same object when they are current; undefined when
// the new ones could not be picked.
export async function withNewColors<T extends { hash: string; palette: ThemePalettes; v?: number }>(
  cache: LogoCache,
  c: T
): Promise<T | undefined> {
  if (c.v === paletteVersion) return c
  const palette = await cache.logoPalette(c.hash)
  return palette && { ...c, palette, v: paletteVersion }
}
