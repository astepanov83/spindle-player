// The canvas can't read CSS colors, so the bar colors are worked out here.

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

// Push the album colors away from the background: toward white on dark, black on light.
export function barColors(palette: [string, string, string], light: boolean): BarColors {
  return light
    ? { c1: mixHex(palette[1], '#000000', 0.25), c2: mixHex(palette[0], '#000000', 0.3) }
    : { c1: palette[1], c2: mixHex(palette[0], '#ffffff', 0.3) }
}
