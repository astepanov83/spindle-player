import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { defaultPalettes, fallbackPalettes, hexToLch } from '../../../shared/palette'
import { field, inksOf, recordInk } from './colors'

const css = readFileSync(join(__dirname, '../assets/theme.css'), 'utf8')
const lightAt = css.indexOf('@media (prefers-color-scheme: light)')
const blocks = { dark: css.slice(0, lightAt), light: css.slice(lightAt) }
const value = (theme: 'dark' | 'light', name: string): string =>
  blocks[theme].match(new RegExp(`${name}:\\s*([^;]+);`))![1].trim()

const hueGap = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180)

describe('made picture colors', () => {
  for (const theme of ['dark', 'light'] as const) {
    it(`${theme}: the field and the record match theme.css`, () => {
      expect(field[theme]).toBe(value(theme, '--field'))
      expect(recordInk[theme]).toBe(value(theme, '--ink-3'))
    })

    it(`${theme}: takes the hue of the palette, so the picture matches the tint`, () => {
      const p = fallbackPalettes('album-1')
      const hue = hexToLch(p[theme][0])[2]
      const inks = inksOf(p, theme)
      expect(inks.label).toBe(p[theme][0])
      for (const c of [inks.disc, inks.ground, ...inks.rings])
        expect(hueGap(hexToLch(c)[2], hue)).toBeLessThan(6)
    })

    it(`${theme}: a grey palette gives a grey picture`, () => {
      const inks = inksOf(defaultPalettes, theme)
      for (const c of [inks.disc, inks.ground, inks.pattern])
        expect(hexToLch(c)[1]).toBeLessThan(0.04)
    })
  }

  it('makes the letters stand out on the ground in both themes', () => {
    const p = fallbackPalettes('x')
    expect(hexToLch(inksOf(p, 'dark').ink)[0]).toBeGreaterThan(
      hexToLch(inksOf(p, 'dark').ground)[0]
    )
    expect(hexToLch(inksOf(p, 'light').ink)[0]).toBeLessThan(hexToLch(inksOf(p, 'light').ground)[0])
  })

  it('puts readable letters on any label color', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
      for (const theme of ['dark', 'light'] as const) {
        const inks = inksOf(fallbackPalettes(seed), theme)
        const gap = Math.abs(hexToLch(inks.onLabel)[0] - hexToLch(inks.label)[0])
        expect(gap).toBeGreaterThan(0.3)
      }
  })
})
