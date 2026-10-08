// What every style of made picture draws from (ticket 103). A style draws on
// a square 100 units wide; the canvas is scaled to the size asked for.
import type { Inks } from './colors'

export type Ctx = OffscreenCanvasRenderingContext2D

export interface Drawing {
  inks: Inks
  // from the seed: the same item always gets the same details
  hash: number
  lengths: number[]
  title: string
  artist: string
  // under 64px on screen, where fine detail and long words don't show
  small: boolean
}

export type Draw = (x: Ctx, d: Drawing) => void

// FNV-1a over the code points
export function hashOf(seed: string): number {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619)
  return h >>> 0
}

export function circle(x: Ctx, r: number): void {
  x.beginPath()
  x.arc(50, 50, r, 0, Math.PI * 2)
}
