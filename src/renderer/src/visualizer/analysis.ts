// The sound analysis every style shares, as in webmusicmo: log spaced bands,
// instant attack, slow release, peak caps. Plain math, so it can be tested.
// The frame loop (loop.ts) feeds it the analyser's data.

export const BANDS = 56
export const WAVE_N = 256
// Hz. MP3 has little useful above 16 kHz.
export const F_LO = 45
export const F_HI = 14500
// how much a bar keeps per frame once the sound drops
export const RELEASE = 0.86
// a gentle lift toward the top band, so treble is not always the smallest
export const TILT_DB = 8
// frames a peak cap sits still, then how much it drops per frame
export const PEAK_HOLD = 18
export const PEAK_FALL = 0.012
// Band power range mapped to bar length 0..1. Tuned on test files from
// -23 to -9 LUFS (see specs/visualizer.md).
export const DB_LO = -75
export const DB_HI = -22
// the bass that makes the cover glow: the average of the first bands
export const BASS_BANDS = 6
// The wave line is lifted so quiet music shows, and soft limited (tanh) so a
// loud master (peaks near 1) stays inside the stage instead of running off it.
export const WAVE_GAIN = 3
// what the wave keeps per frame after a pause
export const WAVE_FADE = 0.85
// below this everything counts as still
const REST = 0.002

export interface Meter {
  levels: Float32Array
  peaks: Float32Array
  hold: Uint8Array
  wave: Float32Array
  // one band's target level, filled from the analyser
  target: Float32Array
}

export function createMeter(): Meter {
  return {
    levels: new Float32Array(BANDS),
    peaks: new Float32Array(BANDS),
    hold: new Uint8Array(BANDS),
    wave: new Float32Array(WAVE_N),
    target: new Float32Array(BANDS)
  }
}

// FFT bin index of each band edge, BANDS + 1 of them, log spaced from F_LO to F_HI.
export function bandEdges(sampleRate: number, binCount: number): Int32Array {
  const nyquist = sampleRate / 2
  const edges = new Int32Array(BANDS + 1)
  for (let i = 0; i <= BANDS; i++) {
    const hz = F_LO * (F_HI / F_LO) ** (i / BANDS)
    edges[i] = Math.min(binCount - 1, Math.round((hz / nyquist) * binCount))
  }
  return edges
}

// Each band's power in dB, with the tilt added. Powers are summed, not averaged,
// so the wide treble bands are not starved. A band narrower than one bin reads one bin.
export function bandDb(freqDb: Float32Array, edges: Int32Array, out: Float32Array): void {
  for (let i = 0; i < BANDS; i++) {
    const from = edges[i]
    const to = Math.max(from + 1, edges[i + 1])
    let power = 0
    for (let b = from; b < to; b++) power += 10 ** (freqDb[b] / 10)
    out[i] = 10 * Math.log10(power + 1e-12) + (i / BANDS) * TILT_DB
  }
}

// dB to a bar length 0..1. The curve keeps quiet bands short.
export function dbToLevel(db: number): number {
  return Math.min(1, Math.max(0, (db - DB_LO) / (DB_HI - DB_LO))) ** 1.3
}

// One frame: bars jump up to the target and fall slowly; caps hold, then fall.
export function stepLevels(m: Meter, target: Float32Array): void {
  const { levels, peaks, hold } = m
  for (let i = 0; i < BANDS; i++) {
    const v = target[i]
    levels[i] = v > levels[i] ? v : levels[i] * RELEASE
    if (levels[i] >= peaks[i]) {
      peaks[i] = levels[i]
      hold[i] = PEAK_HOLD
    } else if (hold[i] > 0) {
      hold[i]--
    } else {
      peaks[i] = Math.max(levels[i], peaks[i] - PEAK_FALL)
    }
  }
}

// One frame of analyser data to levels.
export function analyse(m: Meter, freqDb: Float32Array, edges: Int32Array): void {
  bandDb(freqDb, edges, m.target)
  for (let i = 0; i < BANDS; i++) m.target[i] = dbToLevel(m.target[i])
  stepLevels(m, m.target)
}

// One frame with no sound: everything falls toward zero.
export function rest(m: Meter): void {
  m.target.fill(0)
  stepLevels(m, m.target)
  for (let k = 0; k < WAVE_N; k++) m.wave[k] *= WAVE_FADE
}

// Once nothing moves any more, snaps the last bits to zero, so the resting
// look is drawn exactly, and says true. Otherwise leaves the meter alone.
export function settle(m: Meter): boolean {
  for (let i = 0; i < BANDS; i++) if (m.levels[i] > REST || m.peaks[i] > REST) return false
  for (let k = 0; k < WAVE_N; k++) if (Math.abs(m.wave[k]) > REST) return false
  clear(m)
  return true
}

export function clear(m: Meter): void {
  m.levels.fill(0)
  m.peaks.fill(0)
  m.hold.fill(0)
  m.wave.fill(0)
}

export function bassLevel(levels: Float32Array): number {
  let sum = 0
  for (let i = 0; i < BASS_BANDS; i++) sum += levels[i]
  return sum / BASS_BANDS
}

// WAVE_N evenly spaced samples of the analyser's time data, lifted, within -1..1.
export function sampleWave(time: Float32Array, wave: Float32Array): void {
  const step = Math.floor(time.length / WAVE_N)
  for (let k = 0; k < WAVE_N; k++) wave[k] = Math.tanh(time[k * step] * WAVE_GAIN)
}

// Ring: band i sits this far round from the bottom, on both sides. Bass at the
// bottom (0), treble at the top (PI). Used with the canvas rotate(), where
// turning (0, r) by a gives (-r sin a, r cos a): side 1 goes up the left, -1 the right.
export function ringAngle(i: number, side: 1 | -1): number {
  return side * (i + 0.5) * (Math.PI / BANDS)
}
