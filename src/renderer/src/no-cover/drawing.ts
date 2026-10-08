// What every style of made picture draws from (ticket 103). A style draws on
// a square 100 units wide; the canvas is scaled to the size asked for.
import type { Inks } from './colors'

export type Ctx = OffscreenCanvasRenderingContext2D

export interface Drawing {
  inks: Inks
  // from the seed: the same item always gets the same details
  hash: number
  lengths: number[]
  // each track's loudness over time, as the library sends it (MadeArt)
  loudness?: string[]
  title: string
  artist: string
  // the genre tag as written, for the genre style
  genre?: string
  // under 64px on screen, where fine detail and long words don't show
  small: boolean
  // an artist's picture, shown in a circle: the marks stay inside it
  round?: boolean
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

// A seeded stream of numbers from 0 to 1 (mulberry32), so the same item
// always gets the same details.
export function rngOf(hash: number): () => number {
  let a = hash >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
