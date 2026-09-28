// Made-up levels for the start banner, where no sound plays yet: one tone
// sliding from bass to treble and back. They go through stepLevels like real
// ones, so bars and caps move as in Ring.
import { BANDS } from './analysis'

// bass to treble and back
export const SWEEP_MS = 5000
// how many bands the tone spreads over on each side
const WIDTH = 3

export function idleTarget(ms: number, out: Float32Array): void {
  // eases at the ends, as a sweep turning round
  const at = ((1 - Math.cos((ms / SWEEP_MS) * 2 * Math.PI)) / 2) * (BANDS - 1)
  for (let i = 0; i < BANDS; i++) out[i] = 0.9 * Math.exp(-(((i - at) / WIDTH) ** 2))
}
