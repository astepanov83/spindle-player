// The record with one ring per track, outer ring first, its width set by the
// track's length (ticket 103). The label has the palette's main color, and a
// pattern and angle picked by the seed.
import { circle, type Ctx, type Draw, type Drawing } from './drawing'

export interface Ring {
  // the middle of the ring, and its width
  r: number
  width: number
}

// the grooved part of the record, between the label and the edge
const outer = 44.5
const inner = 21
const span = outer - inner
const labelR = 19

// One ring per length; a station or a song with no lengths gets one. The gaps
// shrink on a long album so the rings keep most of the room.
export function ringsOf(lengths: number[]): Ring[] {
  const ls = lengths.length ? lengths.map((l) => Math.max(0, l)) : [1]
  const total = ls.reduce((a, b) => a + b, 0)
  const n = ls.length
  const gap = n > 1 ? Math.min(1, (span * 0.25) / (n - 1)) : 0
  const free = span - gap * (n - 1)
  let at = outer
  return ls.map((l) => {
    const width = total > 0 ? (free * l) / total : free / n
    const ring = { r: at - width / 2, width }
    at -= width + gap
    return ring
  })
}

export const patterns = ['dots', 'stripes', 'split', 'star'] as const
export type Pattern = (typeof patterns)[number]

export const patternOf = (hash: number): Pattern => patterns[(hash >>> 9) % patterns.length]
// in degrees
export const angleOf = (hash: number): number => (hash >>> 13) % 180

function drawPattern(x: Ctx, pattern: Pattern, angle: number): void {
  const R = labelR
  x.save()
  x.translate(50, 50)
  x.rotate((angle * Math.PI) / 180)
  x.beginPath()
  if (pattern === 'dots') {
    for (let row = 0, y = -R; y <= R; row++, y += 5)
      for (let dx = -R; dx <= R; dx += 5) {
        const cx = dx + (row % 2) * 2.5
        x.moveTo(cx + 1.1, y)
        x.arc(cx, y, 1.1, 0, Math.PI * 2)
      }
  } else if (pattern === 'stripes') {
    for (let s = -R - 1; s < R + 1; s += 7) x.rect(s, -R - 1, 3, 2 * R + 2)
  } else if (pattern === 'split') {
    x.rect(0, -R - 1, R + 1, 2 * R + 2)
  } else {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      const rr = i % 2 ? R * 0.42 : R * 0.95
      x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    x.closePath()
  }
  x.fill()
  x.restore()
}

export const drawRings: Draw = (x: Ctx, d: Drawing) => {
  const { inks } = d
  x.fillStyle = inks.field
  x.fillRect(0, 0, 100, 100)
  circle(x, 46)
  x.fillStyle = inks.disc
  x.fill()
  ringsOf(d.lengths).forEach((ring, i) => {
    circle(x, ring.r)
    x.strokeStyle = inks.rings[i % 2]
    x.lineWidth = ring.width
    x.stroke()
  })
  // fine grooves only show on a big picture
  if (!d.small) {
    x.strokeStyle = inks.grooves
    x.lineWidth = 0.25
    for (let g = 44; g > inner + 0.5; g -= 1.5) {
      circle(x, g)
      x.stroke()
    }
  }
  circle(x, labelR)
  x.fillStyle = inks.label
  x.fill()
  x.save()
  circle(x, labelR)
  x.clip()
  x.fillStyle = inks.pattern
  drawPattern(x, patternOf(d.hash), angleOf(d.hash))
  x.restore()
  circle(x, 2)
  x.fillStyle = inks.field
  x.fill()
}
