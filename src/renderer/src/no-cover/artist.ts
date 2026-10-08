// An artist's made picture (ticket 105): their initials, in the style's
// colors. The picture is shown round, so it fills the square.
import { initials } from './initials'
import { angleOf, drawPattern, patternOf } from './rings'
import type { Ctx, Draw, Drawing } from './drawing'
import { titleFont } from './type'

// A mark of one sign (Japanese) can be bigger than a pair.
export const sizeOf = (text: string): number => ([...text].length > 1 ? 40 : 52)

// `size`, `y` and `spacing` are for a small mark in the sound picture's middle.
export function drawInitials(
  x: Ctx,
  name: string,
  color: string,
  at: { size?: number; y?: number; spacing?: number } = {}
): void {
  const text = initials(name)
  x.fillStyle = color
  x.font = titleFont(at.size ?? sizeOf(text))
  x.letterSpacing = `${at.spacing ?? -1.2}px`
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillText(text, 50, at.y ?? 52)
}

// The label of the rings picture: its color and faint pattern behind.
export const drawArtistRings: Draw = (x: Ctx, d: Drawing) => {
  const { inks } = d
  x.fillStyle = inks.label
  x.fillRect(0, 0, 100, 100)
  x.save()
  x.globalAlpha = 0.28
  x.fillStyle = inks.pattern
  // 1.6 times the label's marks, reaching the corners
  drawPattern(x, patternOf(d.hash), angleOf(d.hash), 71 / 1.6, 1.6)
  x.restore()
  drawInitials(x, d.title, inks.onLabel)
}

export const drawArtistType: Draw = (x: Ctx, d: Drawing) => {
  x.fillStyle = d.inks.ground
  x.fillRect(0, 0, 100, 100)
  drawInitials(x, d.title, d.inks.ink)
}
