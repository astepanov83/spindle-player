// The colors of a made picture (ticket 103), from the item's palette, so the
// picture and the album tint have the same hue. Lightness is fixed per theme,
// as in the options page (plans/2026-10-08-no-cover-art.html).
import { hexToLch, lchToHex, type ThemePalettes } from '../../../shared/palette'
import type { ThemeName } from '../../../shared/theme'

export interface Inks {
  // the tile around the record: --field
  field: string
  // the record and its rings, light and dark in turn
  disc: string
  rings: [string, string]
  grooves: string
  // the label: the palette's main color, and its pattern
  label: string
  pattern: string
  // the type picture's ground and letters
  ground: string
  ink: string
  // today's grey record: --ink-3
  record: string
}

// Must match --field and --ink-3 in theme.css (colors.test.ts checks).
export const field: Record<ThemeName, string> = { dark: '#1b1d23', light: '#e3e4e9' }
export const recordInk: Record<ThemeName, string> = {
  dark: 'rgba(255, 255, 255, 0.5)',
  light: 'rgba(21, 22, 26, 0.56)'
}

const tones = {
  dark: { discL: 0.27, discC: 0.04, patternL: 0.84, patternC: 0.08, groundL: 0.42, groundC: 0.11 },
  light: { discL: 0.34, discC: 0.05, patternL: 0.93, patternC: 0.05, groundL: 0.82, groundC: 0.09 }
}
const inkL: Record<ThemeName, number> = { dark: 0.96, light: 0.24 }
const grooves: Record<ThemeName, string> = {
  dark: 'rgba(0, 0, 0, 0.28)',
  light: 'rgba(0, 0, 0, 0.2)'
}

// the chroma of a made palette (palettesFromHue): a grey palette (no logo
// before 103, a cover not picked yet) gives a grey picture
const madeChroma = 0.11

export function inksOf(palettes: ThemePalettes, theme: ThemeName): Inks {
  const [main, accent] = palettes[theme]
  const [, c, hue] = hexToLch(main)
  const accentHue = hexToLch(accent)[2]
  const k = Math.min(1, c / madeChroma)
  const t = tones[theme]
  const color = (L: number, C: number, H = hue): string => lchToHex([L, C * k, H])
  return {
    field: field[theme],
    disc: color(t.discL, t.discC),
    rings: [color(t.discL + 0.1, t.discC + 0.01), color(t.discL + 0.05, t.discC + 0.01)],
    grooves: grooves[theme],
    label: main,
    pattern: color(t.patternL, t.patternC, accentHue),
    ground: color(t.groundL, t.groundC),
    ink: color(inkL[theme], 0.04),
    record: recordInk[theme]
  }
}
