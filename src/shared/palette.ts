// Album colors picked from a cover (ticket 009). Plain math with no DOM, so the
// hidden cover window can run it and Vitest can test it.
//
// A palette is [main, accent, dark], the --c1, --c2 and --c3 of the page.
// Each cover gets one per theme. They share main and dark; the accent is picked
// and fitted for each background, since a pale accent that shows on dark turns
// khaki when it is darkened for light (see specs/themes.md).
import { accentGround, windowBackground, type ThemeName } from './theme'

export type Palette = [string, string, string]

export interface ThemePalettes {
  dark: Palette
  light: Palette
}

// Bump when the picking changes, so palettes in the index are made again
// (from the cached small covers; no music file is read again).
// 2: the accent is fitted to every area it is drawn on, not only --bg.
export const paletteVersion = 2

// Accent against what it is drawn on: 3:1, the minimum for marks that are not
// text (WCAG 1.4.11).
export const accentContrast = 3

// --- color conversions (sRGB, OKLab, OKLCH) ---

// L 0..1, C 0..~0.37, H in degrees
export type Lch = [number, number, number]
type Lab = [number, number, number]
type Rgb = [number, number, number]

const toLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
const fromLinear = (c: number): number =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055

// 8-bit channel to linear, looked up: a 64x64 sample is 12k channels
const linear8 = Array.from({ length: 256 }, (_, i) => toLinear(i / 255))

function linearToLab(r: number, g: number, b: number): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

function labToLinear([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
}

function labToLch([L, a, b]: Lab): Lch {
  const h = (Math.atan2(b, a) * 180) / Math.PI
  return [L, Math.hypot(a, b), h < 0 ? h + 360 : h]
}

function lchToLab([L, C, H]: Lch): Lab {
  const r = (H * Math.PI) / 180
  return [L, C * Math.cos(r), C * Math.sin(r)]
}

export function hexToLch(hex: string): Lch {
  const n = parseInt(hex.slice(1), 16)
  return labToLch(linearToLab(linear8[n >> 16], linear8[(n >> 8) & 255], linear8[n & 255]))
}

const eps = 1e-4
const inGamut = (rgb: Rgb): boolean => rgb.every((c) => c >= -eps && c <= 1 + eps)

// Lowers chroma until the color fits in sRGB, keeping lightness and hue.
export function toGamut(c: Lch): Lch {
  const L = Math.min(1, Math.max(0, c[0]))
  if (inGamut(labToLinear(lchToLab([L, c[1], c[2]])))) return [L, c[1], c[2]]
  let lo = 0
  let hi = c[1]
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(labToLinear(lchToLab([L, mid, c[2]])))) lo = mid
    else hi = mid
  }
  return [L, lo, c[2]]
}

function linearOf(c: Lch): Rgb {
  return labToLinear(lchToLab(toGamut(c))).map((v) => Math.min(1, Math.max(0, v))) as Rgb
}

export function lchToHex(c: Lch): string {
  return (
    '#' +
    linearOf(c)
      .map((v) =>
        Math.round(fromLinear(v) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

// color-mix(in oklch, a t, b), as the page mixes album colors into --bg:
// lightness and chroma in a straight line, hue the short way round. A color
// with chroma under 0.02 counts as grey with no hue, so it takes the other
// color's; Chromium does that too (checked in the app: --bg is such a grey).
export function mixOklch(a: string, b: string, t: number): string {
  const [La, Ca, Ha] = hexToLch(a)
  const [Lb, Cb, Hb] = hexToLch(b)
  const grey = 0.02
  const ha = Ca < grey ? Hb : Ha
  const hb = Cb < grey ? Ha : Hb
  let d = hb - ha
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return lchToHex([La * t + Lb * (1 - t), Ca * t + Cb * (1 - t), (ha + d * (1 - t) + 360) % 360])
}

// WCAG relative luminance and contrast ratio.
function luminance(rgb: Rgb): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

export function contrast(a: string, b: string): number {
  const ya = luminance(linearOf(hexToLch(a)))
  const yb = luminance(linearOf(hexToLch(b)))
  return (Math.max(ya, yb) + 0.05) / (Math.min(ya, yb) + 0.05)
}

function contrastLch(c: Lch, bgY: number): number {
  const y = luminance(linearOf(c))
  return (Math.max(y, bgY) + 0.05) / (Math.min(y, bgY) + 0.05)
}

// --- swatches: the main colors of a picture ---

export interface Swatch {
  lch: Lch
  // part of the picture, 0..1
  share: number
}

function dist(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

// Groups RGBA pixels (a small sample, say 64x64) into a few swatches with
// k-means in OKLab. Pixels are first counted into coarse bins, so the result
// is the same every time and a few odd pixels don't get a swatch of their own.
export function swatches(rgba: ArrayLike<number>, k = 8): Swatch[] {
  const bins = new Map<number, { lab: Lab; n: number }>()
  let total = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue
    const lab = linearToLab(linear8[rgba[i]], linear8[rgba[i + 1]], linear8[rgba[i + 2]])
    // about 20 lightness steps and 25 steps each way on a and b
    const key =
      Math.round(lab[0] * 20) * 4096 +
      (Math.round(lab[1] * 60) + 32) * 64 +
      (Math.round(lab[2] * 60) + 32)
    const bin = bins.get(key)
    if (bin) {
      bin.lab[0] += lab[0]
      bin.lab[1] += lab[1]
      bin.lab[2] += lab[2]
      bin.n++
    } else bins.set(key, { lab: [...lab], n: 1 })
    total++
  }
  if (!total) return []
  const points = [...bins.values()]
    .map((b) => ({ lab: b.lab.map((v) => v / b.n) as Lab, n: b.n }))
    .sort((a, b) => b.n - a.n)

  // start from the biggest bins that are not too close to one already taken
  const centers: Lab[] = []
  for (const minGap of [0.12, 0.06, 0]) {
    for (const p of points) {
      if (centers.length >= k) break
      if (centers.every((c) => dist(c, p.lab) > minGap)) centers.push([...p.lab])
    }
    if (centers.length >= Math.min(k, points.length)) break
  }

  const owner = new Array<number>(points.length).fill(0)
  for (let round = 0; round < 12; round++) {
    points.forEach((p, i) => {
      let best = 0
      let bestD = Infinity
      centers.forEach((c, j) => {
        const d = dist(c, p.lab)
        if (d < bestD) {
          bestD = d
          best = j
        }
      })
      owner[i] = best
    })
    const sums = centers.map(() => [0, 0, 0, 0])
    points.forEach((p, i) => {
      const s = sums[owner[i]]
      s[0] += p.lab[0] * p.n
      s[1] += p.lab[1] * p.n
      s[2] += p.lab[2] * p.n
      s[3] += p.n
    })
    sums.forEach((s, j) => {
      if (s[3]) centers[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]
    })
  }

  const counts = centers.map(() => 0)
  points.forEach((p, i) => (counts[owner[i]] += p.n))
  return centers
    .map((c, j) => ({ lch: labToLch(c), share: counts[j] / total }))
    .filter((s) => s.share > 0)
    .sort((a, b) => b.share - a.share)
}

// --- picking main, accent and dark ---

const labOf = (c: Lch): Lab => lchToLab(c)
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

// The color that stands for the cover: big, colorful, not near black or white.
function pickMain(sw: Swatch[]): Lch {
  let best = sw[0]
  let bestScore = -1
  for (const s of sw) {
    const [L, C] = s.lch
    const mid = clamp(1 - Math.abs(L - 0.62) * 1.6, 0.15, 1)
    const score = Math.sqrt(s.share) * (0.04 + C) * mid
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  const [L, C, H] = best.lch
  // tints mix main into --bg, so it stays a mid tone like the prototype's
  return toGamut([clamp(L, 0.42, 0.8), C, H])
}

// A dark color from the cover, for the lower part of tinted areas and the Focus blobs.
function pickDark(sw: Swatch[], main: Lch): Lch {
  let best: Swatch | undefined
  let bestScore = -1
  for (const s of sw) {
    const [L, C] = s.lch
    if (L > 0.5 || s.share < 0.02) continue
    const score = Math.sqrt(s.share) * (1 - L) * (0.05 + C)
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  // a pale cover has no dark part: use main's hue
  const [, C, H] = best ? best.lch : main
  const L = best ? best.lch[0] : 0.28
  return toGamut([clamp(L, 0.2, 0.32), Math.min(C, 0.09), H])
}

// Moves lightness away from the backgrounds until the contrast target is met
// on all of them. Dark theme: lighter. Light theme: darker. The first
// background says which.
export function fitAccent(c: Lch, bg: string | string[], target = accentContrast): Lch {
  const bgs = typeof bg === 'string' ? [bg] : bg
  const ys = bgs.map((b) => luminance(linearOf(hexToLch(b))))
  const up = hexToLch(bgs[0])[0] < 0.5
  const worst = (x: Lch): number => Math.min(...ys.map((y) => contrastLch(x, y)))
  let out = toGamut(c)
  for (let i = 0; i < 100 && worst(out) < target; i++) {
    const L = out[0] + (up ? 0.01 : -0.01)
    if (L < 0 || L > 1) break
    out = toGamut([L, c[1], shiftHue(c[2], c[0] - L)])
  }
  return out
}

// Yellow darkened keeps its hue and turns olive. Turning it toward orange as it
// darkens gives ochre and amber instead, which read as the same warm color.
export function shiftHue(h: number, drop: number): number {
  if (drop <= 0 || h < 60 || h > 120) return h
  return h - (h - 60) * clamp(drop / 0.3, 0, 1) * 0.6
}

const accentCandidates = (sw: Swatch[], main: Lch): Swatch[] => [
  ...sw,
  // main itself, and a lighter main, for covers with one color
  { lch: main, share: 0.02 },
  { lch: toGamut([Math.min(0.9, main[0] + 0.2), main[1], main[2]]), share: 0.02 }
]

// Accent lightness per background. Dark: light enough for bars to glow, as in
// the prototype. Light: dark enough to show, but not so dark that the current
// row turns into a black bar.
export const accentRange = {
  dark: [0.66, 0.93],
  light: [0.42, 0.62]
} as const

// Everything the accent is drawn on, for a cover with these main and dark
// colors: the theme's flat areas, and the album tint (Studio's player column)
// at its top and its middle, worked out as the page mixes them (Node.svelte).
// Focus's blurred color blobs are left out: they move under the bars, one of
// them is the accent itself, and fitting to the main one turned dark accents
// white and light ones to another hue (decision 106).
export function accentSurfaces(main: string, dark: string, theme: ThemeName): string[] {
  const g = accentGround[theme]
  const bg = windowBackground[theme]
  return [...g.flat, mixOklch(main, bg, g.tint), mixOklch(dark, bg, g.tint / 2)]
}

// Moves a color into the theme's lightness range, then fits it for contrast
// on `surfaces` (just --bg when not given).
export function accentFor(
  c: Lch,
  theme: ThemeName,
  surfaces: string[] = [windowBackground[theme]]
): Lch {
  const [lo, hi] = accentRange[theme]
  const L = clamp(c[0], lo, hi)
  return fitAccent(toGamut([L, c[1], shiftHue(c[2], c[0] - L)]), surfaces)
}

// The accent for one theme: colorful and apart from main, as it is after fitting.
function pickAccent(sw: Swatch[], main: Lch, dark: Lch, theme: ThemeName): Lch {
  let best: Lch | undefined
  let bestScore = -1
  const mainLab = labOf(main)
  const surfaces = accentSurfaces(lchToHex(main), lchToHex(dark), theme)
  for (const s of accentCandidates(sw, main)) {
    const fit = accentFor(s.lch, theme, surfaces)
    // dark: an accent that looks like main adds nothing. Light: main is only a
    // faint tint there, so main itself makes a good mark.
    const apart = dist(labOf(s.lch), mainLab)
    const apartScore = theme === 'dark' ? clamp(apart / 0.15, 0.1, 1) : 1
    // how far it had to move; a big move gives a color the cover doesn't have
    const moved = clamp(1 - Math.abs(fit[0] - s.lch[0]), 0.3, 1)
    const score = Math.pow(s.share, 0.3) * (0.03 + fit[1]) * apartScore * moved
    if (score > bestScore) {
      bestScore = score
      best = fit
    }
  }
  return best ?? accentFor(main, theme, surfaces)
}

// Both palettes from a list of swatches. An empty list gives the neutral grey set.
export function palettesFromSwatches(sw: Swatch[]): ThemePalettes {
  if (!sw.length) return { dark: [...defaultPalettes.dark], light: [...defaultPalettes.light] }
  const main = pickMain(sw)
  const dark = pickDark(sw, main)
  const mainHex = lchToHex(main)
  const darkHex = lchToHex(dark)
  return {
    dark: [mainHex, lchToHex(pickAccent(sw, main, dark, 'dark')), darkHex],
    light: [mainHex, lchToHex(pickAccent(sw, main, dark, 'light')), darkHex]
  }
}

// Both palettes from a cover's pixels (RGBA, a small sample is enough).
export function coverPalettes(rgba: ArrayLike<number>): ThemePalettes {
  return palettesFromSwatches(swatches(rgba))
}

// A made-up palette around one hue, for albums with no cover.
export function palettesFromHue(h: number, c = 0.11): ThemePalettes {
  return palettesFromSwatches([
    { lch: [0.62, c, h], share: 0.6 },
    { lch: [0.82, c * 0.9, (h + 35) % 360], share: 0.15 },
    { lch: [0.27, c * 0.5, h], share: 0.25 }
  ])
}

// Albums with no cover: a palette from their id, so each keeps the same colors
// and they don't all look the same grey.
export function fallbackPalettes(seed: string): ThemePalettes {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return palettesFromHue((h >>> 0) % 360)
}

// Until something plays: the neutral set from before 009, with a darker accent for light.
export const defaultPalettes: ThemePalettes = {
  dark: ['#6f7787', '#a3adc2', '#232733'],
  light: ['#6f7787', '#5c6578', '#232733']
}

const hexRe = /^#[0-9a-f]{6}$/
const isPalette = (v: unknown): v is Palette =>
  Array.isArray(v) && v.length === 3 && v.every((c) => typeof c === 'string' && hexRe.test(c))

// Checks a stored value; anything else is undefined.
export function parseThemePalettes(v: unknown): ThemePalettes | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as Record<string, unknown>
  if (!isPalette(o.dark) || !isPalette(o.light)) return undefined
  return { dark: [...o.dark], light: [...o.light] }
}
