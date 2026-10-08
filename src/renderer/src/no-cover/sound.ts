// The sound picture (ticket 107): a ring of bars around the middle, one arc
// per track. An arc is as long as its track; the bars are as tall as the
// track is loud at that time (ticket 106). A track with no data, and a
// station, gets flat bars.
import { decodeCurve } from '../../../shared/loudness-text'
import { drawInitials } from './artist'
import { tone } from './colors'
import { circle, type Ctx, type Draw, type Drawing } from './drawing'

const flat = 0.45
const r0 = 18
// the bars' reach, past r0 (47 at most, inside the round artist picture)
const base = 3
const reach = 26

export interface Bar {
  track: number
  // 0-1
  level: number
  // 0-1 around the ring
  at: number
}

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length

// The curve's value at t (0-1), between its two nearest values.
function valueAt(curve: number[], t: number): number {
  const p = Math.min(1, Math.max(0, t)) * (curve.length - 1)
  const i = Math.floor(p)
  const next = curve[Math.min(i + 1, curve.length - 1)]
  return curve[i] + (next - curve[i]) * (p - i)
}

// The bars of a ring of `n` places: each track gets places in proportion to
// its length, with a gap between tracks that shrinks on a long list (none
// from about 40 tracks). A track too short for a place is left out.
export function barsOf(lengths: number[], curves: number[][], n: number, gapMax = 3): Bar[] {
  const ls = lengths.length ? lengths.map((l) => Math.max(0, l)) : [1]
  const count = ls.length
  const gap = count > 1 ? Math.min(gapMax, Math.floor((n * 0.25) / count)) : 0
  const free = n - gap * count
  const total = ls.reduce((a, b) => a + b, 0)
  const bars: Bar[] = []
  let used = 0
  let cum = 0
  ls.forEach((l, track) => {
    cum += total > 0 ? l : 1
    const end = Math.round((cum / (total > 0 ? total : count)) * free)
    const places = end - used
    const curve = curves[track]?.length ? curves[track] : undefined
    for (let j = 0; j < places; j++) {
      // each bar listens to its own stretch of the track
      const level = curve
        ? mean([0, 1, 2, 3].map((k) => valueAt(curve, (j + (k + 0.5) / 4) / places)))
        : flat
      bars.push({ track, level, at: (used + j + gap * track) / n })
    }
    used = end
  })
  return bars
}

function drawBars(x: Ctx, d: Drawing): void {
  const { inks } = d
  x.fillStyle = inks.field
  x.fillRect(0, 0, 100, 100)
  const curves = (d.loudness ?? []).map(decodeCurve)
  // fewer, thicker bars on a small picture
  const bars = d.small ? barsOf(d.lengths, curves, 48, 1) : barsOf(d.lengths, curves, 132)
  x.lineCap = 'round'
  x.lineWidth = d.small ? 2.6 : 1.25
  // the palette's main color, and the accent tone, or on the
  // light theme a darker tone of its hue (the pale accent is lost there)
  const second = inks.dark ? inks.pattern : tone(inks, 0.42, 0.1)
  ;[inks.label, second].forEach((color, tone) => {
    x.beginPath()
    for (const b of bars) {
      if (b.track % 2 !== tone) continue
      const a = (-0.25 + b.at) * Math.PI * 2
      const r1 = r0 + base + b.level * reach
      x.moveTo(50 + Math.cos(a) * r0, 50 + Math.sin(a) * r0)
      x.lineTo(50 + Math.cos(a) * r1, 50 + Math.sin(a) * r1)
    }
    x.strokeStyle = color
    x.stroke()
  })
  circle(x, 13)
  x.fillStyle = inks.disc
  x.fill()
}

export const drawSound: Draw = (x, d) => {
  drawBars(x, d)
  circle(x, 2)
  x.fillStyle = d.inks.field
  x.fill()
}

// An artist's: all their tracks in one ring, their initials in the middle.
export const drawArtistSound: Draw = (x, d) => {
  drawBars(x, d)
  drawInitials(x, d.title, d.inks.pattern, { size: 11, y: 51, spacing: -0.3 })
}
