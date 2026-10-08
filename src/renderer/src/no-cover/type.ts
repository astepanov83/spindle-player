// The title set big on the palette's color, the artist under it (ticket 103).
// The seed puts the words at the top or the bottom. Under 64px only the
// initials fit. A long title gets smaller type, then is cut after a few lines.
import { initials } from './initials'
import type { Ctx, Draw, Drawing } from './drawing'

// as --display and --mono in theme.css
const display = '"Bricolage Grotesque Variable", "Segoe UI", system-ui, sans-serif'
const mono = '"JetBrains Mono", ui-monospace, Menlo, monospace'
export const titleFont = (size: number): string => `750 ${size}px ${display}`
export const artistFont = (size: number): string => `400 ${size}px ${mono}`

const pad = 9
const width = 100 - 2 * pad
const artistSize = 6.5
// Title sizes tried in turn, with the lines each may take: the first one
// the title fits in is used, else the last, cut.
export const titleSteps = [
  { size: 15, lines: 4 },
  { size: 12, lines: 5 },
  { size: 10, lines: 6 }
]
const lineHeight = 0.98

// Breaks text into lines no wider than `max`, between words, and inside a
// word that is wider than a line (Japanese has no spaces).
export function wrapLines(text: string, max: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const joined = line ? `${line} ${word}` : word
    if (measure(joined) <= max) {
      line = joined
      continue
    }
    if (line) lines.push(line)
    line = ''
    for (const ch of word) {
      if (line && measure(line + ch) > max) {
        lines.push(line)
        line = ''
      }
      line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

// The first `n` lines, the last one ending in "…" when some were left out.
export function clampLines(
  lines: string[],
  n: number,
  max: number,
  measure: (s: string) => number
): string[] {
  if (lines.length <= n) return lines
  const out = lines.slice(0, n)
  let last = [...out[n - 1]]
  while (last.length && measure(last.join('').trimEnd() + '…') > max) last = last.slice(0, -1)
  out[n - 1] = last.join('').trimEnd() + '…'
  return out
}

// The title's size and lines: the biggest step it fits in whole.
export function fitTitle(
  title: string,
  measureAt: (size: number) => (s: string) => number
): { size: number; lines: string[] } {
  for (const [i, step] of titleSteps.entries()) {
    const measure = measureAt(step.size)
    const lines = wrapLines(title, width, measure)
    if (lines.length <= step.lines || i === titleSteps.length - 1)
      return { size: step.size, lines: clampLines(lines, step.lines, width, measure) }
  }
  return { size: titleSteps[0].size, lines: [] }
}

// One line, cut with "…" when too wide.
function cutLine(x: Ctx, text: string, max: number): string {
  if (x.measureText(text).width <= max) return text
  let chars = [...text]
  while (chars.length && x.measureText(chars.join('') + '…').width > max) chars = chars.slice(0, -1)
  return chars.join('').trimEnd() + '…'
}

export const atBottom = (hash: number): boolean => ((hash >>> 7) & 1) === 1

export const drawType: Draw = (x: Ctx, d: Drawing) => {
  const { inks } = d
  x.fillStyle = inks.ground
  x.fillRect(0, 0, 100, 100)
  x.fillStyle = inks.ink
  x.textBaseline = 'top'
  if (d.small) {
    const text = initials(d.title)
    x.font = titleFont(44)
    x.letterSpacing = '-1.3px'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText(text, 50, 52)
    return
  }
  const title = d.title.trim() || '♪'
  const fit = fitTitle(title, (size) => {
    x.font = titleFont(size)
    x.letterSpacing = `${-0.02 * size}px`
    return (s) => x.measureText(s).width
  })
  const step = fit.size * lineHeight
  const titleH = fit.lines.length * step
  const artist = d.artist.trim().toLocaleUpperCase()
  const artistTop = 100 - pad - artistSize
  const top = atBottom(d.hash) ? (artist ? artistTop - 6 : 100 - pad) - titleH : pad
  x.font = titleFont(fit.size)
  x.letterSpacing = `${-0.02 * fit.size}px`
  fit.lines.forEach((line, i) => x.fillText(line, pad, top + i * step))
  if (!artist) return
  x.font = artistFont(artistSize)
  x.letterSpacing = `${0.06 * artistSize}px`
  x.globalAlpha = 0.8
  x.fillText(cutLine(x, artist, width), pad, artistTop)
  x.globalAlpha = 1
}
