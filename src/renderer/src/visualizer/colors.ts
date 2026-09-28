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
  c1: string
  c2: string
}

// The accent as the theme's palette has it (already readable on that background),
// and main pushed away from the background: toward white on dark, black on light.
export function barColors(palettes: ThemePalettes, light: boolean): BarColors {
  const [main, accent] = palettes[light ? 'light' : 'dark']
  return { c1: accent, c2: mixHex(main, light ? '#000000' : '#ffffff', 0.3) }
}
