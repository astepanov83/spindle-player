import { describe, expect, it } from 'vitest'
import {
  BANDS,
  BASS_BANDS,
  DB_HI,
  DB_LO,
  F_HI,
  F_LO,
  PEAK_FALL,
  PEAK_HOLD,
  RELEASE,
  TILT_DB,
  WAVE_GAIN,
  WAVE_N,
  analyse,
  bandDb,
  bandEdges,
  bassLevel,
  createMeter,
  dbToLevel,
  rest,
  ringAngle,
  sampleWave,
  settled,
  stepLevels
} from './analysis'

const RATE = 48000
const BINS = 2048 // fftSize 4096
const hzOf = (bin: number): number => (bin * RATE) / 2 / BINS

describe('bandEdges', () => {
  const e = bandEdges(RATE, BINS)
  it('has one more edge than bands, from F_LO to F_HI', () => {
    expect(e.length).toBe(BANDS + 1)
    expect(hzOf(e[0])).toBeCloseTo(F_LO, -1)
    expect(Math.abs(hzOf(e[BANDS]) - F_HI)).toBeLessThan(RATE / 2 / BINS)
  })
  it('never goes down, and never past the last bin', () => {
    for (let i = 1; i <= BANDS; i++) expect(e[i]).toBeGreaterThanOrEqual(e[i - 1])
    expect(Math.max(...e)).toBeLessThanOrEqual(BINS - 1)
    // a low sample rate puts F_HI past the end
    expect(Math.max(...bandEdges(22050, BINS))).toBe(BINS - 1)
  })
  it('is log spaced: bands get wider toward the treble', () => {
    expect(e[BANDS] - e[BANDS - 1]).toBeGreaterThan(20 * Math.max(1, e[1] - e[0]))
  })
})

describe('bandDb', () => {
  const e = bandEdges(RATE, BINS)
  const out = new Float32Array(BANDS)
  it('sums the power of the bins in a band, then adds the tilt', () => {
    const freq = new Float32Array(BINS).fill(-40)
    bandDb(freq, e, out)
    const last = BANDS - 1
    const bins = e[last + 1] - e[last]
    // n bins at -40 dB each is -40 + 10 log10(n)
    expect(out[last]).toBeCloseTo(-40 + 10 * Math.log10(bins) + (last / BANDS) * TILT_DB, 3)
    expect(out[0]).toBeCloseTo(-40 + 10 * Math.log10(Math.max(1, e[1] - e[0])), 3)
  })
  it('reads one bin for a band narrower than a bin', () => {
    const freq = new Float32Array(BINS).fill(-Infinity)
    freq[e[0]] = -30
    bandDb(freq, e, out)
    expect(out[0]).toBeCloseTo(-30, 3)
  })
  it('handles silence (-Infinity) without NaN', () => {
    bandDb(new Float32Array(BINS).fill(-Infinity), e, out)
    for (const v of out) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('dbToLevel', () => {
  it('maps DB_LO..DB_HI to 0..1 and clamps', () => {
    expect(dbToLevel(DB_LO)).toBe(0)
    expect(dbToLevel(DB_LO - 30)).toBe(0)
    expect(dbToLevel(DB_HI)).toBe(1)
    expect(dbToLevel(DB_HI + 30)).toBe(1)
  })
  it('bends quiet bands down (power 1.3)', () => {
    const mid = (DB_LO + DB_HI) / 2
    expect(dbToLevel(mid)).toBeCloseTo(0.5 ** 1.3, 5)
  })
})

describe('stepLevels', () => {
  const target = (v: number): Float32Array => new Float32Array(BANDS).fill(v)
  it('attacks at once and releases slowly', () => {
    const m = createMeter()
    stepLevels(m, target(0.8))
    expect(m.levels[3]).toBeCloseTo(0.8)
    stepLevels(m, target(0))
    expect(m.levels[3]).toBeCloseTo(0.8 * RELEASE)
    stepLevels(m, target(0))
    expect(m.levels[3]).toBeCloseTo(0.8 * RELEASE ** 2)
  })
  it('a louder frame during the release jumps up again', () => {
    const m = createMeter()
    stepLevels(m, target(0.5))
    stepLevels(m, target(0.1))
    stepLevels(m, target(0.9))
    expect(m.levels[0]).toBeCloseTo(0.9)
  })
  it('peaks jump with the bar, hold, then fall at a steady pace', () => {
    const m = createMeter()
    stepLevels(m, target(1))
    expect(m.peaks[0]).toBe(1)
    for (let f = 0; f < PEAK_HOLD; f++) {
      stepLevels(m, target(0))
      expect(m.peaks[0]).toBe(1)
    }
    stepLevels(m, target(0))
    expect(m.peaks[0]).toBeCloseTo(1 - PEAK_FALL)
    stepLevels(m, target(0))
    expect(m.peaks[0]).toBeCloseTo(1 - 2 * PEAK_FALL)
  })
  it('a peak never sits below its bar', () => {
    const m = createMeter()
    stepLevels(m, target(0.5))
    for (let f = 0; f < 200; f++) {
      stepLevels(m, target(0.3))
      expect(m.peaks[0]).toBeGreaterThanOrEqual(m.levels[0])
    }
    expect(m.peaks[0]).toBeCloseTo(0.3)
  })
})

describe('analyse', () => {
  it('turns analyser dB into levels', () => {
    const m = createMeter()
    const e = bandEdges(RATE, BINS)
    analyse(m, new Float32Array(BINS).fill(DB_HI + 10), e)
    expect(m.levels[0]).toBe(1)
    analyse(m, new Float32Array(BINS).fill(-Infinity), e)
    expect(m.levels[0]).toBeCloseTo(RELEASE)
  })
})

describe('rest and settled', () => {
  it('falls to zero, then reports settled with everything exactly zero', () => {
    const m = createMeter()
    stepLevels(m, new Float32Array(BANDS).fill(1))
    m.wave.fill(0.5)
    expect(settled(m)).toBe(false)
    let frames = 0
    while (!settled(m)) {
      rest(m)
      frames++
      expect(frames).toBeLessThan(400)
    }
    // hold, then a fall from 1 at PEAK_FALL a frame, is the slowest part
    expect(frames).toBeGreaterThan(PEAK_HOLD + 1 / PEAK_FALL - 5)
    expect(Math.max(...m.levels, ...m.peaks, ...m.wave)).toBe(0)
  })
})

describe('bassLevel', () => {
  it('is the average of the first bands only', () => {
    const levels = new Float32Array(BANDS)
    levels.fill(1, 0, BASS_BANDS)
    levels.fill(0.2, BASS_BANDS)
    expect(bassLevel(levels)).toBeCloseTo(1)
    levels[0] = 0.4
    expect(bassLevel(levels)).toBeCloseTo((0.4 + BASS_BANDS - 1) / BASS_BANDS)
  })
})

describe('sampleWave', () => {
  it('takes evenly spaced samples and lifts them', () => {
    const time = Float32Array.from({ length: 4096 }, (_, i) => i / 4096)
    const wave = new Float32Array(WAVE_N)
    sampleWave(time, wave)
    expect(wave[0]).toBe(0)
    // small samples: about linear
    expect(wave[1]).toBeCloseTo((16 / 4096) * WAVE_GAIN, 4)
    expect(wave[WAVE_N - 1]).toBeCloseTo(Math.tanh((255 * 16 * WAVE_GAIN) / 4096))
  })
  it('keeps loud samples inside -1..1', () => {
    const wave = new Float32Array(WAVE_N)
    sampleWave(new Float32Array(4096).fill(-1), wave)
    expect(wave[0]).toBeGreaterThan(-1)
    expect(wave[0]).toBeLessThan(-0.99)
  })
})

describe('ringAngle', () => {
  // where canvas rotate(a) sends the point (0, r): y grows downward
  const point = (a: number): [number, number] => [-Math.sin(a), Math.cos(a)]
  it('puts bass at the bottom and treble at the top', () => {
    const [, yBass] = point(ringAngle(0, 1))
    const [, yTreble] = point(ringAngle(BANDS - 1, 1))
    expect(yBass).toBeGreaterThan(0.99)
    expect(yTreble).toBeLessThan(-0.99)
  })
  it('side 1 goes up the left, side -1 up the right', () => {
    for (let i = 0; i < BANDS; i++) {
      expect(point(ringAngle(i, 1))[0]).toBeLessThan(0)
      expect(point(ringAngle(i, -1))[0]).toBeGreaterThan(0)
    }
  })
  it('the bands fill each half evenly, top half included', () => {
    const above = Array.from({ length: BANDS }, (_, i) => point(ringAngle(i, 1))[1] < 0)
    expect(above.filter(Boolean).length).toBe(BANDS / 2)
    expect(ringAngle(1, 1) - ringAngle(0, 1)).toBeCloseTo(Math.PI / BANDS)
  })
})
