// The join with made-up sound: one tone cut in two songs, the second one
// started early or late, and what comes out must be the tone unbroken.
import { describe, expect, it } from 'vitest'
import { Joiner, lookahead, quantum, type JoinOut } from './join'

const rate = 44100
const w = (2 * Math.PI * 441.7) / rate
const tone = (k: number): number => 0.5 * Math.sin(w * k + 0.3)

// A song in one input: `wave(k)` for its k-th frame, from frame `at` on,
// `len` frames long (none: on and on).
interface Song {
  at: number
  len?: number
  wave: (k: number) => number
}

// Runs the join over `frames`. `arms` are the frames where main says the
// next song was told to play ([frame, from, to]), `resets` where an input
// gets a new song. Gives the left channel and the messages.
function run(o: {
  songs: [Song[], Song[]]
  arms: [number, number, number][]
  resets?: [number, number][]
  frames: number
  joiner?: Joiner
}): { out: Float32Array; said: JoinOut[] } {
  const j = o.joiner ?? new Joiner()
  const n = Math.ceil(o.frames / quantum) * quantum
  const out = new Float32Array(n)
  const said: JoinOut[] = []
  for (let t0 = 0; t0 < n; t0 += quantum) {
    for (const [at, from, to] of o.arms)
      if (at >= t0 && at < t0 + quantum) j.message({ arm: { from, to } })
    for (const [at, lane] of o.resets ?? [])
      if (at >= t0 && at < t0 + quantum) j.message({ reset: lane })
    const ins = o.songs.map((songs) => {
      const x = new Float32Array(quantum)
      for (let k = 0; k < quantum; k++) {
        const t = t0 + k
        for (const s of songs)
          if (t >= s.at && t < s.at + (s.len ?? Infinity)) x[k] = s.wave(t - s.at)
      }
      return x
    })
    const l = new Float32Array(quantum)
    const r = new Float32Array(quantum)
    // input 0 in stereo, input 1 in mono
    const m = j.process([[ins[0], ins[0]], [ins[1]]], [l, r])
    if (m) said.push(m)
    out.set(l, t0)
  }
  return { out, said }
}

// The tone cut at frame `cut`: A is the tone up to there from frame 0, B
// the rest of it, starting at frame `bAt`.
function cutTone(cut: number, bAt: number): [Song[], Song[]] {
  return [[{ at: 0, len: cut, wave: tone }], [{ at: bAt, wave: (k) => tone(cut + k) }]]
}

// How far the output is from a steady tone at its worst, between `from`
// and `to`: a gap, an overlap or a frame out of place shows here.
function corner(x: Float32Array, from: number, to: number): number {
  const k2 = 2 * Math.cos(w)
  let worst = 0
  for (let i = from + 1; i < to - 1; i++)
    worst = Math.max(worst, Math.abs(x[i + 1] - k2 * x[i] + x[i - 1]))
  return worst
}

const zeros = (x: Float32Array, from: number, to: number): number => {
  let n = 0
  for (let i = from; i < to; i++) if (x[i] === 0) n++
  return n
}

describe('the join', () => {
  it('plays a lone song the usual way, the lookahead late', () => {
    const { out, said } = run({ songs: cutTone(4000, 1e9), arms: [], frames: 4096 })
    expect(said).toEqual([])
    expect(out[lookahead + 100]).toBeCloseTo(tone(100), 6)
  })

  it('holds a next song that starts early, and joins it to the frame', () => {
    // B starts 480 frames before A ends
    const { out, said } = run({ songs: cutTone(6000, 5520), arms: [[5500, 0, 1]], frames: 9000 })
    expect(said).toEqual([{ joined: 1, skew: 480, early: 480 }])
    expect(corner(out, lookahead + 10, 8800)).toBeLessThan(1e-6)
    // the tone goes on where it would have, 480 frames later than usual
    expect(out[8000]).toBeCloseTo(tone(8000 - lookahead), 6)
  })

  it('takes a start a bit late out of the lookahead: no gap', () => {
    // B starts 100 frames after A ended
    const { out, said } = run({ songs: cutTone(6000, 6100), arms: [[5900, 0, 1]], frames: 9000 })
    expect(said).toEqual([{ joined: 1, skew: -100, early: -100 }])
    expect(corner(out, lookahead + 10, 8800)).toBeLessThan(1e-6)
  })

  it('a start later than the lookahead can take leaves the gap, and says how late it was', () => {
    const { out, said } = run({ songs: cutTone(6000, 7000), arms: [[6700, 0, 1]], frames: 10000 })
    // let through the usual way when A's end went out with nothing from B yet
    expect(said).toEqual([
      { joined: 1, skew: 0, early: null },
      { joined: 1, skew: 0, early: -1000 }
    ])
    expect(zeros(out, 6000, 8000)).toBe(1000)
  })

  it('a next song that starts silent goes out the usual way', () => {
    const songs = cutTone(6000, 5800)
    songs[1][0] = { at: 5800 + 4000, wave: (k) => tone(6000 + k) }
    const { out, said } = run({ songs, arms: [[5700, 0, 1]], frames: 12000 })
    expect(said).toEqual([{ joined: 1, skew: 0, early: null }])
    expect(out.findIndex((v, i) => i > 6000 + lookahead && v !== 0)).toBe(9800 + lookahead)
  })

  it('a next song whose first frame is an exact zero is not pulled in by it', () => {
    // the tone crosses zero right at the cut: B's first frame is 0, so its
    // sound looks as if it started a frame late
    const z = (k: number): number => 0.5 * Math.sin(w * (k - 6000))
    const songs: [Song[], Song[]] = [
      [{ at: 0, len: 6000, wave: z }],
      [{ at: 5520, wave: (k) => z(6000 + k) }]
    ]
    const { out, said } = run({ songs, arms: [[5500, 0, 1]], frames: 9000 })
    expect(said).toEqual([{ joined: 1, skew: 480, early: 480 }])
    expect(corner(out, lookahead + 10, 8800)).toBeLessThan(1e-6)
  })

  it('another song loaded into the held input drops the hold: both are heard as they are', () => {
    const { out, said } = run({
      songs: [[{ at: 0, len: 6000, wave: tone }], [{ at: 3000, wave: tone }]],
      arms: [[2900, 0, 1]],
      resets: [[2950, 1]],
      frames: 5000
    })
    expect(said).toEqual([])
    expect(out[3000 + lookahead + 10]).toBeCloseTo(tone(3010) + tone(10), 6)
  })

  it('a next song held long while the last one never ends is let through as it is', () => {
    const { out, said } = run({
      songs: [[{ at: 0, wave: tone }], [{ at: 3000, wave: tone }]],
      arms: [[2900, 0, 1]],
      frames: 20000
    })
    expect(said).toEqual([{ joined: 1, skew: 0, early: null }])
    // from then on only B, the usual way
    expect(out[19000]).toBeCloseTo(tone(19000 - lookahead - 3000), 6)
  })

  it('joins song after song with no drift, when each start aims at the held end', () => {
    // A to 6000, then B to 11700 started 300 early: B goes out 300 late.
    // Then A again started 300 before B's end as it goes out, which is
    // B's own end plus its skew: at 11700, so it goes out 300 late too.
    const songs: [Song[], Song[]] = [
      [
        { at: 0, len: 6000, wave: tone },
        { at: 11700, wave: (k) => tone(12000 + k) }
      ],
      [{ at: 5700, len: 6000, wave: (k) => tone(6000 + k) }]
    ]
    const { out, said } = run({
      songs,
      arms: [
        [5600, 0, 1],
        [11600, 1, 0]
      ],
      frames: 16000
    })
    expect(said).toEqual([
      { joined: 1, skew: 300, early: 300 },
      { joined: 0, skew: 300, early: 300 }
    ])
    expect(corner(out, lookahead + 10, 15800)).toBeLessThan(1e-6)
  })

  it('the last song keeps its delay till its end went out, though it is reset at once', () => {
    // as the engine clears the last element when it is done
    const { out } = run({
      songs: cutTone(6000, 5520),
      arms: [[5500, 0, 1]],
      resets: [[6050, 0]],
      frames: 9000
    })
    expect(corner(out, lookahead + 10, 8800)).toBeLessThan(1e-6)
  })
})

// Each element's sound is resampled on its own when the file's rate is not
// the graph's. A plain windowed sinc does that here, from 48 to 44.1 kHz.
describe('the join of resampled songs', () => {
  const inRate = 48000
  const K = 16
  const src = (k: number): number => 0.5 * Math.sin((2 * Math.PI * 441.7 * k) / inRate + 0.3)
  const sinc = (x: number): number => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x))
  // output frame n of `len` source frames from `off`, its frame 0 at output frame 0
  const resampled =
    (off: number, len: number) =>
    (n: number): number => {
      const t = (n * inRate) / rate
      let y = 0
      for (let k = Math.ceil(t - K); k <= Math.floor(t + K); k++) {
        if (k < 0 || k >= len) continue
        const x = t - k
        y += src(off + k) * sinc(x) * (0.5 + 0.5 * Math.cos((Math.PI * x) / K))
      }
      return y
    }

  // The largest miss against the tone around the join in the hearing band,
  // over the tone's peak; B started `early` frames before A's end.
  function miss(cutIn: number, early: number): number {
    const cutOut = Math.round((cutIn * rate) / inRate)
    const bAt = cutOut - early
    // A rings on past its end; B rings before its first frame
    const songs: [Song[], Song[]] = [
      [{ at: 0, len: cutOut + 2 * K, wave: resampled(0, cutIn) }],
      [{ at: bAt - 2 * K, wave: (k) => resampled(cutIn, 1e9)(k - 2 * K) }]
    ]
    const { out } = run({ songs, arms: [[bAt - 4 * K, 0, 1]], frames: cutOut + 4000 })
    const lo = cutOut + lookahead - 900
    let ss = 0
    let sc = 0
    let cc = 0
    let xs = 0
    let xc = 0
    for (let k = lo; k < lo + 400; k++) {
      const s = Math.sin(w * k)
      const c = Math.cos(w * k)
      ss += s * s
      sc += s * c
      cc += c * c
      xs += out[k] * s
      xc += out[k] * c
    }
    const det = ss * cc - sc * sc
    const a = (xs * cc - xc * sc) / det
    const b = (xc * ss - xs * sc) / det
    let worst = 0
    const e = (k: number): number => out[k] - (a * Math.sin(w * k) + b * Math.cos(w * k))
    for (let k = lo + 400; k < cutOut + lookahead + early + 600; k++) {
      // in the hearing band: a 9-frame average, which takes out what is high
      let m = 0
      for (let j = -4; j <= 4; j++) m += e(k + j)
      worst = Math.max(worst, Math.abs(m / 9))
    }
    return worst / 0.5
  }

  it('overlaps their tails, so little is left of a corner in the hearing band', () => {
    // Whole frames can't line up two resamplings exactly: a short burst near
    // the top of the band is left (up to half the tone there), but in the
    // hearing band less than a twentieth.
    for (const cut of [6000, 6001, 6017, 6033, 6100, 6111, 6203, 6250])
      expect(miss(cut, 400)).toBeLessThan(0.07)
  })
})
