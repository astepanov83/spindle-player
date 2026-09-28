// The canvas can't read CSS colors, so the bar colors are worked out here.
import type { ThemePalettes } from '../../../shared/palette'

export function mixHex(hex: string, to: string, t: number): string {
  const rgb = (s: string): number[] => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const a = rgb(hex)
  const b = rgb(to)
  return (
    '#' +
    a
      .map((v, i) =>
        Math.round(v + (b[i] - v) * t)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

export interface BarColors {
  // bar tips and peak caps
  c1: string
  // bar roots
  c2: string
  // how see-through a silent bar is (0..1); loud bars are solid
  fade: number
}

// Dark: the accent as the theme's palette has it, main pushed toward white, and
// quiet bars fade into the background.
// Light: the stage sits on the album tint, not on --bg, where the fitted accent
// (3:1 on --bg) drops to about 2.5:1. So both colors go darker (about 3.4:1 on
// the tints of the test covers) and bars stay mostly solid, since fading
// toward a pale tint washes them out.
export function barColors(palettes: ThemePalettes, light: boolean): BarColors {
  const [main, accent] = palettes[light ? 'light' : 'dark']
  if (light)
    return { c1: mixHex(accent, '#000000', 0.2), c2: mixHex(main, '#000000', 0.4), fade: 0.7 }
  return { c1: accent, c2: mixHex(main, '#ffffff', 0.3), fade: 0.4 }
}
