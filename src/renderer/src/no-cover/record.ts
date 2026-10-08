// Today's grey record from Cover.svelte, drawn on a canvas for the media
// controls. In the app the record stays the SVG in Cover.svelte.
import { circle, type Ctx, type Draw, type Drawing } from './drawing'

// The SVG's circles, as a share of its 356 wide box, which takes 70% of the tile
const k = (0.7 * 100) / 356

export const drawRecord: Draw = (x: Ctx, d: Drawing) => {
  const { inks } = d
  x.fillStyle = inks.field
  x.fillRect(0, 0, 100, 100)
  x.fillStyle = inks.record
  x.globalAlpha = 0.35
  circle(x, 178 * k)
  x.fill()
  x.globalAlpha = 1
  x.strokeStyle = inks.field
  x.lineWidth = 4 * k
  for (const r of [150, 122]) {
    circle(x, r * k)
    x.stroke()
  }
  x.globalAlpha = 0.6
  circle(x, 72 * k)
  x.fill()
  x.globalAlpha = 1
  x.fillStyle = inks.field
  circle(x, 16 * k)
  x.fill()
}
