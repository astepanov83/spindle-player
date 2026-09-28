// Window background per theme. Must match --bg in the renderer's theme.css,
// so there is no flash of a different color before the page paints.
export const windowBackground = {
  dark: '#111216',
  light: '#f4f4f6'
} as const

export type ThemeName = keyof typeof windowBackground

// What the album accent is drawn on (row marks, visualizer bars), per theme,
// so the palette picking can fit the accent to all of them. Must match
// theme.css (theme.test.ts checks). See specs/themes.md.
export interface AccentGround {
  // flat colors: --bg, --bg-side, --bg-title, and --panel over --bg
  flat: string[]
  // --tint: how much main goes into --bg at the top of a tinted area (Studio's player column)
  tint: number
  // --tint-max-l: main is made no lighter than this (oklch L) before it goes
  // into the tint, so a pale cover's tint stays dark enough for a colorful accent
  tintMaxL: number
}

export const accentGround: Record<ThemeName, AccentGround> = {
  dark: {
    // --panel is rgba(20, 21, 26, 0.96) over --bg
    flat: ['#111216', '#0d0e11', '#0c0d10', '#14151a'],
    tint: 0.7,
    tintMaxL: 0.7
  },
  light: {
    // --panel is rgba(252, 252, 253, 0.97) over --bg
    flat: ['#f4f4f6', '#ebecef', '#e6e7eb', '#fcfcfd'],
    tint: 0.35,
    tintMaxL: 1
  }
}
