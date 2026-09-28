// What the draw functions read. The frame loop (loop.ts) fills these from the
// analyser; all zero is the resting look.
import { createMeter } from './analysis'

export { BANDS, WAVE_N } from './analysis'

export const meter = createMeter()
export const { levels, peaks, wave } = meter
