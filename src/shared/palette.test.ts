import { describe, expect, it } from 'vitest'
import {
  accentContrast,
  accentRange,
  accentSurfaces,
  contrast,
  coverPalettes,
  defaultPalettes,
  fallbackPalettes,
  hexToLch,
  lchToHex,
  mixOklch,
  parseThemePalettes,
  shiftHue,
  swatches,
  type ThemePalettes
} from './palette'

// An RGBA sample made of flat parts: [color, number of pixels].
function image(parts: [string, number][]): Uint8Array {
  const out: number[] = []
  for (const [hex, n] of parts) {
    const v = parseInt(hex.slice(1), 16)
    for (let i = 0; i < n; i++) out.push(v >> 16, (v >> 8) & 255, v & 255, 255)
  }
  return new Uint8Array(out)
}

// A smooth two-color gradient, like a photo's sky.
function gradient(from: string, to: string, n = 4096): Uint8Array {
  const a = [1, 3, 5].map((i) => parseInt(from.slice(i, i + 2), 16))
  const b = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16))
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    out.push(...a.map((v, j) => Math.round(v + (b[j] - v) * t)), 255)
  }
  return new Uint8Array(out)
}

const covers: Record<string, Uint8Array> = {
  mostlyWhite: image([
    ['#fafafa', 3800],
    ['#111111', 200],
    ['#444444', 96]
  ]),
  whiteRedDot: image([
    ['#f7f7f5', 3900],
    ['#d62828', 196]
  ]),
  mostlyBlack: image([
    ['#080808', 3950],
    ['#2ec4b6', 146]
  ]),
  salt: image([
    ['#f5e1a4', 2600],
    ['#d64545', 1300],
    ['#2a1b1b', 196]
  ]),
  cream: image([
    ['#f5e1a4', 3900],
    ['#8a7a50', 196]
  ]),
  glacier: image([
    ['#caf0f8', 2048],
    ['#48cae4', 1500],
    ['#03045e', 548]
  ]),
  flatBlue: image([['#0050ff', 4096]]),
  flatYellow: image([['#ffd400', 4096]]),
  greyscale: gradient('#101010', '#e0e0e0'),
  sunset: gradient('#ff7a2f', '#5b2a86'),
  sea: gradient('#0b3d91', '#4fd1c5')
}

const all = (p: ThemePalettes): string[] => [...p.dark, ...p.light]

describe('color conversions', () => {
  it('round-trips hex through oklch', () => {
    for (const hex of ['#000000', '#ffffff', '#d64545', '#f5e1a4', '#0050ff', '#2ec4b6'])
      expect(lchToHex(hexToLch(hex))).toBe(hex)
  })
  it('gives WCAG contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  })
  it('mixes in oklch as color-mix does', () => {
    expect(mixOklch('#d64545', '#111216', 1)).toBe('#d64545')
    expect(mixOklch('#d64545', '#111216', 0)).toBe('#111216')
    // lightness halfway
    const [L] = hexToLch(mixOklch('#ffffff', '#000000', 0.5))
    expect(L).toBeCloseTo(0.5, 2)
    // a grey has no hue of its own, so the mix keeps the color's hue
    const h = hexToLch('#0050ff')[2]
    expect(hexToLch(mixOklch('#0050ff', '#808080', 0.5))[2]).toBeCloseTo(h, 0)
  })
  it('brings out-of-gamut colors back into sRGB', () => {
    expect(lchToHex([0.7, 0.5, 150])).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('swatches', () => {
  it('finds the parts of a picture and their share', () => {
    const sw = swatches(
      image([
        ['#d64545', 3072],
        ['#0050ff', 1024]
      ])
    )
    expect(sw.map((s) => lchToHex(s.lch))).toEqual(['#d64545', '#0050ff'])
    expect(sw.map((s) => s.share)).toEqual([0.75, 0.25])
  })
  it('skips see-through pixels', () => {
    const px = image([
      ['#d64545', 10],
      ['#0050ff', 10]
    ])
    for (let i = 40; i < px.length; i += 4) px[i + 3] = 0
    expect(swatches(px).map((s) => lchToHex(s.lch))).toEqual(['#d64545'])
  })
  it('gives nothing for an empty picture', () => {
    expect(swatches(new Uint8Array())).toEqual([])
    expect(coverPalettes(new Uint8Array())).toEqual(defaultPalettes)
  })
  // Pinned, so a change to the picking shows up here. When it changes on
  // purpose, bump paletteVersion so stored palettes are made again.
  it('gives the same answer for a fixed picture', () => {
    expect(coverPalettes(covers.sunset)).toEqual({
      dark: ['#f37436', '#ffaacd', '#432252'],
      light: ['#f37436', '#c34e00', '#432252']
    })
  })
})

describe('coverPalettes', () => {
  for (const [name, px] of Object.entries(covers))
    it(`${name}: accents are readable and in the theme's range`, () => {
      const p = coverPalettes(px)
      for (const theme of ['dark', 'light'] as const) {
        const [main, accent, dark] = p[theme]
        // on every area it is drawn on, the album tints included
        for (const ground of accentSurfaces(main, dark, theme))
          expect(contrast(accent, ground)).toBeGreaterThanOrEqual(accentContrast)
        const [lo, hi] = accentRange[theme]
        const L = hexToLch(accent)[0]
        expect(L).toBeGreaterThanOrEqual(lo - 0.01)
        expect(L).toBeLessThanOrEqual(hi + 0.01)
      }
      // main and dark are shared, only the accent differs
      expect(p.light[0]).toBe(p.dark[0])
      expect(p.light[2]).toBe(p.dark[2])
      // main is a mid tone and dark is dark, so tints look like the prototype
      expect(hexToLch(p.dark[0])[0]).toBeGreaterThan(0.41)
      expect(hexToLch(p.dark[0])[0]).toBeLessThan(0.81)
      expect(hexToLch(p.dark[2])[0]).toBeLessThan(0.33)
    })

  it('warm pale cover with red: light takes the red, not a khaki cream', () => {
    const p = coverPalettes(covers.salt)
    const [, c, h] = hexToLch(p.light[1])
    expect(c).toBeGreaterThan(0.12)
    expect(h < 40 || h > 330).toBe(true)
    // dark keeps the pale cream, as the prototype had it
    expect(hexToLch(p.dark[1])[0]).toBeGreaterThan(0.85)
  })

  it('cream only: light turns it to ochre instead of olive', () => {
    const [, , h] = hexToLch(coverPalettes(covers.cream).light[1])
    expect(h).toBeLessThan(80)
  })

  it('greyscale stays grey: no made-up hue', () => {
    for (const name of ['greyscale', 'mostlyWhite'])
      for (const c of all(coverPalettes(covers[name]))) expect(hexToLch(c)[1]).toBeLessThan(0.03)
  })

  it('a small colored part wins over a big white one', () => {
    const [main] = coverPalettes(covers.whiteRedDot).dark
    expect(hexToLch(main)[1]).toBeGreaterThan(0.15)
  })

  it('mostly black: the accent comes from the colored line', () => {
    const [, c, h] = hexToLch(coverPalettes(covers.mostlyBlack).dark[1])
    expect(c).toBeGreaterThan(0.08)
    expect(h).toBeGreaterThan(160)
    expect(h).toBeLessThan(200)
  })

  it('one flat color: all three share its hue', () => {
    const p = coverPalettes(covers.flatBlue)
    const hue = hexToLch('#0050ff')[2]
    for (const c of all(p)) expect(Math.abs(hexToLch(c)[2] - hue)).toBeLessThan(8)
  })
})

describe('shiftHue', () => {
  it('turns yellow toward orange only when it gets darker', () => {
    expect(shiftHue(100, 0)).toBe(100)
    expect(shiftHue(100, -0.2)).toBe(100)
    expect(shiftHue(100, 0.3)).toBeCloseTo(76)
    expect(shiftHue(200, 0.3)).toBe(200)
  })
})

describe('fallbackPalettes', () => {
  it('is the same for the same album and differs between albums', () => {
    expect(fallbackPalettes('a1b2')).toEqual(fallbackPalettes('a1b2'))
    const hues = new Set(
      ['a', 'b', 'c', 'd', 'e'].map((s) => Math.round(hexToLch(fallbackPalettes(s).dark[0])[2]))
    )
    expect(hues.size).toBeGreaterThan(3)
  })
  it('is colorful and readable', () => {
    for (const seed of ['x', 'y', 'z', 'Night Bus']) {
      const p = fallbackPalettes(seed)
      expect(hexToLch(p.dark[0])[1]).toBeGreaterThan(0.06)
      for (const theme of ['dark', 'light'] as const)
        for (const ground of accentSurfaces(p[theme][0], p[theme][2], theme))
          expect(contrast(p[theme][1], ground)).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('defaultPalettes', () => {
  it('accents are readable', () => {
    for (const theme of ['dark', 'light'] as const) {
      const [main, accent, dark] = defaultPalettes[theme]
      for (const ground of accentSurfaces(main, dark, theme))
        expect(contrast(accent, ground)).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('parseThemePalettes', () => {
  it('keeps a good value', () => {
    const p = coverPalettes(covers.salt)
    expect(parseThemePalettes(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })
  it('drops anything else', () => {
    for (const v of [
      null,
      'x',
      { dark: ['#000000', '#000000'], light: ['#000000', '#000000', '#000000'] },
      { dark: ['#000000', '#000000', 'red'], light: ['#000000', '#000000', '#000000'] },
      { dark: ['#000000', '#000000', '#000000'] }
    ])
      expect(parseThemePalettes(v)).toBeUndefined()
  })
})
