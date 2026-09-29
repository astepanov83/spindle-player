import { hash } from 'crypto'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { fallbackPalettes } from '../../shared/palette'
import type { Station, StationLogo } from '../../shared/stations'
import { keptLogos, logoSource, metalOnlyLogo, StationLogos, type LogoDeps } from './logos'

const palette = fallbackPalettes('x')
const pic = new Uint8Array([1, 2, 3])
const picHash = hash('sha1', pic)

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
  cache: LogoDeps['cache'] & { addLogo: Mock<LogoDeps['cache']['addLogo']> }
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
      hasLogo: async (h: string) => d.files.has(h)
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

describe('StationLogos', () => {
  const url = 'https://a.example/l.png'

  it('makes a logo from the picture, named by its hash', async () => {
    const d = deps()
    const logos = new StationLogos(d)
    expect(await logos.logoFor(st('a', { logoUrl: url }))).toEqual({ hash: picHash, palette })
    expect(d.loads).toEqual([url])
  })

  it('marks a logo under 64px as small', async () => {
    const logos = new StationLogos(deps(48))
    expect(await logos.logoFor(st('a', { logoUrl: url }))).toEqual({
      hash: picHash,
      palette,
      small: true
    })
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
    const have: StationLogo = { hash: picHash, palette }
    d.files.add(picHash)
    expect(await logos.logoFor(st('a', { logoUrl: url, logo: have }))).toBe(have)
    expect(d.load).not.toHaveBeenCalled()
    d.files.clear()
    expect(await logos.logoFor(st('a', { logoUrl: url, logo: have }))).toEqual(have)
    expect(d.load).toHaveBeenCalledTimes(1)
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
    expect(apply).toHaveBeenCalledWith('a', { hash: picHash, palette })
    apply.mockClear()
    await logos.update(st('a', { logoUrl: url, logo: { hash: picHash, palette } }), apply)
    expect(apply).not.toHaveBeenCalled()
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
