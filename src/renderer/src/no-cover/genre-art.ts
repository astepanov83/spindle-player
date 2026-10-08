// The genre style (ticket 104): the tag picks a drawing family, the seed
// picks the colors' turn and where things sit. Colors are of the palette's
// hue, so the picture and the tint match. A small picture (under 64px) gets
// a simpler version: fewer, bigger marks.
import { tone } from './colors'
import { rngOf, type Ctx, type Draw, type Drawing } from './drawing'
import { familyOf, type Family } from './genre'

type FamilyDraw = (x: Ctx, d: Drawing, r: () => number) => void

// Bigger than the picture, so a round version drawn smaller still fills it.
function ground(x: Ctx, color: string): void {
  x.fillStyle = color
  x.fillRect(-100, -100, 300, 300)
}

function dot(x: Ctx, cx: number, cy: number, r: number, color: string): void {
  x.beginPath()
  x.arc(cx, cy, r, 0, Math.PI * 2)
  x.fillStyle = color
  x.fill()
}

// soft blurs
const ambient: FamilyDraw = (x, d, r) => {
  const { inks, small } = d
  ground(x, tone(inks, inks.dark ? 0.26 : 0.86, 0.04))
  const colors = [tone(inks, 0.72, 0.13), tone(inks, 0.65, 0.12, 50), tone(inks, 0.8, 0.08, -40)]
  for (const c of colors.slice(0, small ? 2 : 3)) {
    const cx = 10 + r() * 80
    const cy = 10 + r() * 80
    const rad = 40 + r() * 25
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad)
    g.addColorStop(0, c)
    g.addColorStop(1, c + '00')
    x.fillStyle = g
    x.fillRect(cx - rad, cy - rad, 2 * rad, 2 * rad)
  }
}

// slanted stripes
const rock: FamilyDraw = (x, d, r) => {
  const { inks, small } = d
  const colors = [tone(inks, 0.62, 0.18), tone(inks, 0.9, 0.04, 30), tone(inks, 0.2, 0.03)]
  ground(x, colors[2])
  x.save()
  x.translate(50, 50)
  x.rotate(((-20 - r() * 50) * Math.PI) / 180)
  let at = -110
  for (let k = 0; at < 110; k++) {
    const w = small ? 16 + r() * 16 : 6 + r() * 22
    x.fillStyle = colors[k % 3]
    x.fillRect(at, -110, w, 220)
    at += w
  }
  x.restore()
}

// a sun over hills
const folk: FamilyDraw = (x, d, r) => {
  const { inks, small } = d
  ground(x, tone(inks, inks.dark ? 0.36 : 0.92, 0.05, 40))
  dot(x, 25 + r() * 50, 18 + r() * 12, small ? 11 : 9, tone(inks, 0.85, 0.12, 70))
  const hills = small ? 2 : 4
  const gap = small ? 24 : 15
  for (let k = 0; k < hills; k++) {
    const y0 = (small ? 48 : 42) + k * gap
    const amp = (small ? 7 : 4) + r() * 7
    const phase = r() * 6
    const f = 0.04 + r() * 0.05
    x.beginPath()
    x.moveTo(-10, y0)
    for (let px = -10; px <= 110; px += 5) x.lineTo(px, y0 + Math.sin(px * f + phase) * amp)
    x.lineTo(110, 200)
    x.lineTo(-10, 200)
    x.closePath()
    x.fillStyle = tone(inks, 0.62 - k * (small ? 0.2 : 0.11), 0.1, k * 8)
    x.fill()
  }
}

// a grid of squares, a few lit
const electronic: FamilyDraw = (x, d, r) => {
  const { inks, small } = d
  ground(x, tone(inks, 0.17, 0.03))
  const n = small ? 3 : 6
  const step = small ? 30 : 15
  const side = small ? 24 : 11
  const start = small ? 8 : 7
  const hot = Math.floor(r() * n * n)
  for (let k = 0; k < n * n; k++) {
    const px = start + (k % n) * step
    const py = start + Math.floor(k / n) * step
    x.fillStyle =
      k === hot
        ? tone(inks, 0.88, 0.15, 60)
        : r() < 0.38
          ? tone(inks, 0.62, 0.17)
          : tone(inks, 0.27, 0.04)
    x.beginPath()
    x.roundRect(px, py, side, side, small ? 3 : 1.5)
    x.fill()
  }
}

// a circle over the lines of a staff
const classical: FamilyDraw = (x, d, r) => {
  const { inks, small } = d
  ground(x, tone(inks, inks.dark ? 0.23 : 0.95, 0.012))
  dot(x, 30 + r() * 40, 30 + r() * 30, (small ? 15 : 12) + r() * 10, tone(inks, 0.6, 0.14))
  x.strokeStyle = inks.dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.35)'
  x.lineWidth = small ? 1.8 : 0.5
  const lines = small ? 3 : 9
  const gap = small ? 8 : 3.2
  for (let k = 0; k < lines; k++) {
    x.beginPath()
    x.moveTo(10, 62 + k * gap)
    x.lineTo(90, 62 + k * gap)
    x.stroke()
  }
}

// overlapping circles over a stage edge
const jazz: FamilyDraw = (x, d, r) => {
  const { inks, small } = d
  const dark = tone(inks, 0.19, 0.02)
  ground(x, dark)
  const colors = [tone(inks, 0.62, 0.16), tone(inks, 0.7, 0.13, 120), tone(inks, 0.93, 0.02)]
  x.globalAlpha = 0.82
  for (const c of colors.slice(0, small ? 2 : 3))
    dot(x, 20 + r() * 60, 15 + r() * 55, 18 + r() * 18, c)
  x.globalAlpha = 1
  if (small) return
  x.fillStyle = dark
  x.fillRect(-10, 82, 120, 120)
  x.fillStyle = colors[2]
  x.fillRect(8, 88, 30 + r() * 40, 4)
}

// a circle and a triangle
const pop: FamilyDraw = (x, d, r) => {
  const { inks } = d
  ground(x, tone(inks, 0.72, 0.17))
  dot(x, 35 + r() * 30, 35 + r() * 20, 26 + r() * 10, tone(inks, 0.92, 0.09, 60))
  const left = 10 + r() * 40
  x.beginPath()
  x.moveTo(left, 92)
  x.lineTo(left + 46, 92)
  x.lineTo(left + 23, 50)
  x.closePath()
  x.fillStyle = tone(inks, 0.38, 0.16, 200)
  x.fill()
}

// no genre: a plain split in two tones
const none: FamilyDraw = (x, d) => {
  const { inks } = d
  ground(x, tone(inks, inks.dark ? 0.32 : 0.8, 0.06))
  x.beginPath()
  x.moveTo(-10, 110)
  x.lineTo(110, -10)
  x.lineTo(110, 110)
  x.closePath()
  x.fillStyle = tone(inks, inks.dark ? 0.42 : 0.7, 0.08)
  x.fill()
}

const families: Record<Family, FamilyDraw> = {
  ambient,
  rock,
  folk,
  electronic,
  classical,
  jazz,
  pop,
  none
}

export const drawFamily =
  (family: Family): Draw =>
  (x: Ctx, d: Drawing) => {
    x.save()
    if (d.round) {
      // the corners are cut off, so keep the marks away from them
      x.translate(50, 50)
      x.scale(0.82, 0.82)
      x.translate(-50, -50)
    }
    families[family](x, d, rngOf(d.hash))
    x.restore()
  }

// The drawing for the item's genre tag; `genre` comes in `Drawing`.
export const drawGenre: Draw = (x, d) => drawFamily(familyOf(d.genre))(x, d)
