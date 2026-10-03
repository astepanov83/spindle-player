import { hash } from 'crypto'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { fallbackPalettes, paletteVersion } from '../../../shared/palette'
import type { Station, StationLogo } from '../../../shared/stations'
import {
  keptLogos,
  LoadSkipped,
  logoSource,
  logoSources,
  metalOnlyLogo,
  onLocalNetwork,
  needsBundledLogo,
  StationLogos,
  type LogoDeps
} from './logos'

const palette = fallbackPalettes('x')
const pic = new Uint8Array([1, 2, 3])
const picHash = hash('sha1', pic)
const repainted = fallbackPalettes('new colors')

const st = (id: string, more: Partial<Station> = {}): Station => ({
  id,
  name: id,
  tags: [],
  streams: [{ url: `https://${id}.example/s` }],
  ...more
})

// A cache that makes every picture at this size, and says which files it has.
type FakeDeps = LogoDeps & {
  files: Set<string>
  loads: string[]
  keeps: number
  load: Mock<LogoDeps['load']>
  cache: LogoDeps['cache'] & {
    addLogo: Mock<LogoDeps['cache']['addLogo']>
    logoPalette: Mock<LogoDeps['cache']['logoPalette']>
  }
}
function deps(side = 128): FakeDeps {
  const d: FakeDeps = {
    files: new Set<string>(),
    loads: [] as string[],
    keeps: 0,
    load: vi.fn<LogoDeps['load']>(async (source: string) => {
      d.loads.push(source)
      return pic
    }),
    cache: {
      addLogo: vi.fn<LogoDeps['cache']['addLogo']>(async (h: string) => {
        d.files.add(h)
        return { palette, side }
      }),
      hasLogo: async (h: string) => d.files.has(h),
      logoPalette: vi.fn<LogoDeps['cache']['logoPalette']>(async () => repainted)
    },
    kept: () => void d.keeps++,
    log: () => {}
  }
  return d
}

describe('logoSource', () => {
  it('is the logo url, or the logo shipped with Metal Only', () => {
    expect(logoSource(st('a', { logoUrl: 'https://a.example/l.png' }))).toBe(
      'https://a.example/l.png'
    )
    expect(logoSource(st('metal-only'))).toBe(metalOnlyLogo)
    expect(logoSource(st('a'))).toBeUndefined()
  })
})

describe('logoSources', () => {
  it('is the logo url, then the homepage’s icons (ticket 033)', () => {
    const site = 'https://a.example/'
    expect(logoSources(st('a', { logoUrl: 'https://a.example/l.png', site }))).toEqual([
      'https://a.example/l.png',
      'site:https://a.example/'
    ])
    expect(logoSources(st('a', { site }))).toEqual(['site:https://a.example/'])
    expect(logoSources(st('a'))).toEqual([])
  })
})

describe('onLocalNetwork', () => {
  it('is true when the station’s site or a stream is on a local address', () => {
    expect(onLocalNetwork(st('a', { site: 'http://192.168.1.2/' }))).toBe(true)
    expect(onLocalNetwork(st('a', { streams: [{ url: 'http://10.0.0.3:8000/s' }] }))).toBe(true)
    expect(onLocalNetwork(st('a', { site: 'https://a.example/' }))).toBe(false)
  })

  it('counts the station’s own playlist file too (final fix 3)', () => {
    expect(onLocalNetwork(st('a', { pls: ['http://192.168.1.2/listen.pls'] }))).toBe(true)
    expect(onLocalNetwork(st('a', { pls: ['https://a.example/listen.pls'] }))).toBe(false)
  })
})

describe('needsBundledLogo', () => {
  it('is true for a station with a shipped logo and no logo yet', () => {
    expect(needsBundledLogo(st('metal-only'))).toBe(true)
    expect(needsBundledLogo(st('a', { logoUrl: 'https://a.example/l.png' }))).toBe(false)
    const logo: StationLogo = { hash: 'a'.repeat(40), palette }
    expect(needsBundledLogo(st('metal-only', { logo }))).toBe(false)
  })
})

describe('StationLogos', () => {
  const url = 'https://a.example/l.png'
  // what main makes from url now
  const made: StationLogo = { hash: picHash, palette, from: url, v: paletteVersion }

  it('makes a logo from the picture, named by its hash', async () => {
    const d = deps()
    const logos = new StationLogos(d)
    expect(await logos.logoFor(st('a', { logoUrl: url }))).toEqual(made)
    expect(d.loads).toEqual([url])
  })

  it('marks a logo under 64px as small', async () => {
    const logos = new StationLogos(deps(48))
    expect(await logos.logoFor(st('a', { logoUrl: url }))).toEqual({ ...made, small: true })
  })

  it('does not try a failed fetch again in the same run', async () => {
    const d = deps()
    d.load.mockRejectedValue(new Error('HTTP 404'))
    const logos = new StationLogos(d)
    expect(await logos.logoFor(st('a', { logoUrl: url }))).toBeUndefined()
    expect(await logos.logoFor(st('b', { logoUrl: url }))).toBeUndefined()
    expect(d.load).toHaveBeenCalledTimes(1)
    // the next run tries again
    d.load.mockResolvedValue(pic)
    expect(await new StationLogos(d).logoFor(st('a', { logoUrl: url }))).toBeDefined()
  })

  it('tries a source again after a load it skipped (radio was off), and logs nothing', async () => {
    const d = deps()
    d.log = vi.fn()
    d.load.mockRejectedValueOnce(new LoadSkipped('radio is off'))
    const logos = new StationLogos(d)
    expect(await logos.logoFor(st('a', { logoUrl: url }))).toBeUndefined()
    expect(await logos.logoFor(st('a', { logoUrl: url }))).toEqual(made)
    expect(d.log).not.toHaveBeenCalled()
  })

  it('does not try a picture the cover window could not use again in the same run', async () => {
    const d = deps()
    d.cache.addLogo.mockResolvedValue(undefined)
    const logos = new StationLogos(d)
    await logos.logoFor(st('a', { logoUrl: url }))
    await logos.logoFor(st('a', { logoUrl: url }))
    expect(d.load).toHaveBeenCalledTimes(1)
  })

  it('fetches once for calls at the same time, and once a run', async () => {
    const d = deps()
    const logos = new StationLogos(d)
    const s = st('a', { logoUrl: url })
    await Promise.all([logos.logoFor(s), logos.logoFor(s)])
    await logos.logoFor(s)
    expect(d.load).toHaveBeenCalledTimes(1)
  })

  it('keeps a logo whose files are there, and makes it again when they are gone', async () => {
    const d = deps()
    const logos = new StationLogos(d)
    const have = made
    d.files.add(picHash)
    expect(await logos.logoFor(st('a', { logoUrl: url, logo: have }))).toBe(have)
    expect(d.load).not.toHaveBeenCalled()
    d.files.clear()
    expect(await logos.logoFor(st('a', { logoUrl: url, logo: have }))).toEqual(have)
    expect(d.load).toHaveBeenCalledTimes(1)
  })

  it('makes the logo again when the station’s logo address changed', async () => {
    const d = deps()
    const logos = new StationLogos(d)
    const other = 'b'.repeat(40)
    d.files.add(other)
    const old: StationLogo = { ...made, hash: other, from: 'https://a.example/old.png' }
    expect(await logos.logoFor(st('a', { logoUrl: url, logo: old }))).toEqual(made)
    expect(d.loads).toEqual([url])
  })

  it('makes a logo with no source again from the station’s source (it may have changed)', async () => {
    const d = deps()
    const logos = new StationLogos(d)
    const other = 'b'.repeat(40)
    d.files.add(other)
    const noSource: StationLogo = { hash: other, palette, v: paletteVersion }
    expect(await logos.logoFor(st('a', { logoUrl: url, logo: noSource }))).toEqual(made)
    expect(d.loads).toEqual([url])
  })

  it('keeps a logo with no source when it can’t be made again', async () => {
    const d = deps()
    d.load.mockRejectedValue(new Error('offline'))
    const logos = new StationLogos(d)
    d.files.add(picHash)
    const noSource: StationLogo = { hash: picHash, palette, v: paletteVersion }
    expect(await logos.logoFor(st('a', { logoUrl: url, logo: noSource }))).toBe(noSource)
    // with its files gone it is dropped
    d.files.clear()
    expect(await logos.logoFor(st('a', { logoUrl: url, logo: noSource }))).toBeUndefined()
  })

  it('picks new colors from the small cover for an old palette version, with no fetch', async () => {
    const d = deps()
    const logos = new StationLogos(d)
    d.files.add(picHash)
    for (const old of [
      { ...made, v: paletteVersion - 1 },
      { hash: picHash, palette, from: url }
    ]) {
      expect(await logos.logoFor(st('a', { logoUrl: url, logo: old }))).toEqual({
        ...made,
        palette: repainted
      })
    }
    expect(d.cache.logoPalette).toHaveBeenCalledWith(picHash)
    expect(d.load).not.toHaveBeenCalled()
  })

  it('keeps the old colors when new ones can’t be picked, and tries again next run', async () => {
    const d = deps()
    d.cache.logoPalette.mockResolvedValue(undefined)
    const logos = new StationLogos(d)
    d.files.add(picHash)
    const old = { ...made, v: paletteVersion - 1 }
    expect(await logos.logoFor(st('a', { logoUrl: url, logo: old }))).toBe(old)
    expect(d.load).not.toHaveBeenCalled()
  })

  it('drops a logo whose files are gone when there is nothing to make it from', async () => {
    const logos = new StationLogos(deps())
    expect(await logos.logoFor(st('a', { logo: { hash: picHash, palette } }))).toBeUndefined()
  })

  it('tells the prune about a hash before its files are written', async () => {
    const d = deps()
    const logos = new StationLogos(d)
    d.cache.addLogo.mockImplementation(async (h: string) => {
      expect(logos.keptThisRun().has(h)).toBe(true)
      expect(d.keeps).toBe(1)
      return { palette, side: 128 }
    })
    await logos.logoFor(st('a', { logoUrl: url }))
    expect(d.cache.addLogo).toHaveBeenCalled()
  })

  it('hands a changed logo on, and nothing when it is the same', async () => {
    const d = deps()
    const logos = new StationLogos(d)
    const apply = vi.fn()
    await logos.update(st('a', { logoUrl: url }), apply)
    expect(apply).toHaveBeenCalledWith('a', made)
    apply.mockClear()
    await logos.update(st('a', { logoUrl: url, logo: made }), apply)
    expect(apply).not.toHaveBeenCalled()
  })
})

describe('StationLogos from the homepage (ticket 033)', () => {
  const url = 'https://a.example/l.png'
  const site = 'https://a.example/'
  const fromSite: StationLogo = { hash: picHash, palette, from: `site:${site}`, v: paletteVersion }

  it('makes the logo from the homepage when the station has no logo url', async () => {
    const d = deps()
    const logos = new StationLogos(d)
    expect(await logos.logoFor(st('a', { site }))).toEqual(fromSite)
    expect(d.loads).toEqual([`site:${site}`])
  })

  it('goes to the homepage when the logo url fails', async () => {
    const d = deps()
    d.load.mockImplementation(async (source: string) => {
      d.loads.push(source)
      if (source === url) throw new Error('HTTP 404')
      return pic
    })
    const logos = new StationLogos(d)
    expect(await logos.logoFor(st('a', { logoUrl: url, site }))).toEqual(fromSite)
    expect(d.loads).toEqual([url, `site:${site}`])
  })

  it('reads a homepage once a run, also when it has no icon (the station keeps the tile)', async () => {
    const d = deps()
    d.load.mockRejectedValue(new Error('no icon on the page'))
    const logos = new StationLogos(d)
    expect(await logos.logoFor(st('a', { site }))).toBeUndefined()
    expect(await logos.logoFor(st('a', { site }))).toBeUndefined()
    expect(d.load).toHaveBeenCalledTimes(1)
  })

  it('keeps a homepage logo with no new request while the logo url still fails', async () => {
    const d = deps()
    d.load.mockRejectedValue(new Error('HTTP 404'))
    d.files.add(picHash)
    const logos = new StationLogos(d)
    expect(await logos.logoFor(st('a', { logoUrl: url, site, logo: fromSite }))).toBe(fromSite)
    // the logo url is tried once this run, the homepage not again
    expect(d.load).toHaveBeenCalledTimes(1)
    expect(d.load).toHaveBeenCalledWith(url, expect.anything())
  })

  it('takes the logo url’s logo once it appears or loads', async () => {
    const d = deps()
    d.files.add(picHash)
    const logos = new StationLogos(d)
    expect(await logos.logoFor(st('a', { logoUrl: url, site, logo: fromSite }))).toEqual({
      ...fromSite,
      from: url
    })
    expect(d.loads).toEqual([url])
  })

  it('hands the station to load, so it can tell a local station', async () => {
    const d = deps()
    const s = st('a', { site })
    await new StationLogos(d).logoFor(s)
    expect(d.load).toHaveBeenCalledWith(`site:${site}`, s)
  })

  it('keeps a logo with no source before it reads the homepage', async () => {
    const d = deps()
    d.load.mockRejectedValue(new Error('HTTP 404'))
    d.files.add(picHash)
    const noSource: StationLogo = { hash: picHash, palette, v: paletteVersion }
    const logos = new StationLogos(d)
    expect(await logos.logoFor(st('a', { logoUrl: url, site, logo: noSource }))).toBe(noSource)
    expect(d.load.mock.calls.map((c) => c[0])).toEqual([url])
    // with its files gone the homepage is read
    d.files.clear()
    d.load.mockResolvedValue(pic)
    expect(await logos.logoFor(st('a', { logoUrl: url, site, logo: noSource }))).toEqual(fromSite)
  })

  it('reads the homepage again when the station’s site changed', async () => {
    const d = deps()
    d.files.add(picHash)
    const logos = new StationLogos(d)
    const other = 'https://b.example/'
    expect(await logos.logoFor(st('a', { site: other, logo: fromSite }))).toEqual({
      ...fromSite,
      from: `site:${other}`
    })
    expect(d.loads).toEqual([`site:${other}`])
  })
})

describe('keptLogos', () => {
  it('keeps the logos of saved stations and the ones made this run', () => {
    const a = 'a'.repeat(40)
    const b = 'b'.repeat(40)
    const saved = [st('x', { logo: { hash: a, palette } }), st('y')]
    expect(keptLogos(saved, new Set([b])).sort()).toEqual([a, b])
  })
})
