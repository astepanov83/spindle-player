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

// The accent (bar tips and peak caps) is used as the theme's palette has it:
// it is picked with 3:1 on every area a stage sits on, the album tint included.
// Dark: main pushed toward white, and quiet bars fade into the background.
// Light: main pushed toward black, and bars stay mostly solid, since fading
// toward a pale tint washes them out.
export function barColors(palettes: ThemePalettes, light: boolean): BarColors {
  const [main, accent] = palettes[light ? 'light' : 'dark']
  if (light) return { c1: accent, c2: mixHex(main, '#000000', 0.4), fade: 0.7 }
  return { c1: accent, c2: mixHex(main, '#ffffff', 0.3), fade: 0.4 }
}
