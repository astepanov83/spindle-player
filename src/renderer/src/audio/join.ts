// Joins the sound of the two <audio> elements so the next song's first sound
// comes right after the last song's last sound, to the sample (ticket 087).
//
// A timer can start the next element only to within a few ms, and any gap or
// overlap between two halves of one sound is a click. So the engine starts it
// a little early, and this holds its sound back until the song before has run
// out, then lets it through that much later, for the rest of its song. An
// element that ran out gives exact zeros; music almost never does for long.
//
// It runs on the audio thread (join-worklet.ts). Plain code here, so tests
// can feed it frames.

export const quantum = 128
// All sound goes out this many frames late, so that an end is sure, and the
// tails below found, before the frame after it goes out. 9 ms at 44.1 kHz.
export const lookahead = 384
// this many frames of exact silence after the last sound are the end
const endRun = 32
// A song at another rate than the graph's is resampled, which gives it a
// short tail of ringing before its first sample and after its last (about
// 35 frames in all from 48 to 44.1 kHz; none when the rates match). The
// tails of the two songs have to overlap by that much to add up to the sound
// they were cut from. It is found from the sound itself: the overlap that
// leaves the least of a corner in it (tailsOf), up to this many frames.
const maxTails = 192
// A song that starts with a few exact zeros looks as if it started later
// than it did: its tails are then less than none, this much at most.
const maxLate = 32
// frames after the join looked at for that
const tailWindow = 64
// A next song with no sound yet when the last one's end goes out started
// silent, or late. Sound within this many frames after counts as late.
const lateWatch = 2048

// Main to the audio thread. `arm`: input `to` was just told to play, as the
// next song after input `from`. `reset`: an input has a new song or none.
export type JoinIn = { arm: { from: number; to: number } } | { reset: number }
// The audio thread to main. `skew`: frames input `joined` goes out later
// than a song played the usual way. `early`: frames its first sound came
// before it was needed, which is how the next start is aimed (minus: it came
// late); null when that can't be told (it started silent).
export type JoinOut = { joined: number; skew: number; early: number | null }

class Lane {
  readonly ring: [Float32Array, Float32Array]
  // frames from coming in to going out
  delay = lookahead
  // heard from this output frame, until that one (a held next song: from Infinity)
  from = -Infinity
  until = Infinity
  // its last frame with sound; -1 for none yet
  lastSound = -1
  // a reset asked for while its last sound had still to go out
  resetLater = false

  constructor(size: number) {
    this.ring = [new Float32Array(size), new Float32Array(size)]
  }

  reset(): void {
    this.delay = lookahead
    this.from = -Infinity
    this.until = Infinity
    this.resetLater = false
  }
}

export class Joiner {
  readonly #size: number
  readonly #mask: number
  readonly #lanes: Lane[]
  // frames come in up to here
  #t = 0
  // the next song is held; `first` is its first frame with sound, -1 till then
  #arm: { from: number; to: number; first: number } | undefined
  // a next song with no sound yet, let through the usual way: is it late?
  #watch: { lane: number; at: number } | undefined
  // the overlap of the tails found last, for a join with no time to look
  #tails = 0

  // `size`: frames each input keeps, a power of two, well over the longest
  // hold. 32768 is 0.7 s at 44.1 kHz.
  constructor(size = 1 << 15, inputs = 2) {
    this.#size = size
    this.#mask = size - 1
    this.#lanes = Array.from({ length: inputs }, () => new Lane(size))
  }

  message(m: JoinIn): void {
    if ('arm' in m) {
      const to = this.#lanes[m.arm.to]
      to.reset()
      to.from = Infinity
      this.#arm = { ...m.arm, first: -1 }
      if (this.#watch?.lane === m.arm.to) this.#watch = undefined
      return
    }
    const a = this.#arm
    const lane = this.#lanes[m.reset]
    if (a?.to === m.reset) this.#arm = undefined
    if (this.#watch?.lane === m.reset) this.#watch = undefined
    // the song before may still be sounding out: it keeps its delay till then
    if (a?.from === m.reset || (lane.until !== Infinity && this.#t < lane.until))
      lane.resetLater = true
    else lane.reset()
  }

  // One quantum: each input's channels in (none is silence, one is mono), two
  // channels out. A message for main when a next song was let through.
  process(inputs: Float32Array[][], out: Float32Array[]): JoinOut | undefined {
    const t0 = this.#t
    let said: JoinOut | undefined
    this.#lanes.forEach((lane, i) => {
      const s = this.#take(lane, i, inputs[i] ?? [], t0)
      said ??= s
    })
    this.#t = t0 + quantum
    said ??= this.#join(t0)
    this.#lanes.forEach((lane, i) => {
      if (lane.resetLater && t0 >= lane.until && this.#arm?.from !== i) lane.reset()
    })
    const [l, r] = out
    for (let k = 0; k < quantum; k++) {
      const t = t0 + k
      let a = 0
      let b = 0
      for (const lane of this.#lanes) {
        if (t < lane.from || t >= lane.until) continue
        const at = (t - lane.delay) & this.#mask
        a += lane.ring[0][at]
        b += lane.ring[1][at]
      }
      l[k] = a
      if (r) r[k] = b
    }
    return said
  }

  // Keeps a quantum of input `i`, and notes where its sound is. When it is a
  // next song that was let through with no sound, its sound coming says how
  // late it was.
  #take(lane: Lane, i: number, chans: Float32Array[], t0: number): JoinOut | undefined {
    const [l, r] = chans
    const a = this.#arm?.to === i ? this.#arm : undefined
    const w = this.#watch?.lane === i ? this.#watch : undefined
    let said: JoinOut | undefined
    for (let k = 0; k < quantum; k++) {
      const x = l ? l[k] : 0
      const y = r ? r[k] : x
      const at = (t0 + k) & this.#mask
      lane.ring[0][at] = x
      lane.ring[1][at] = y
      if (x === 0 && y === 0) continue
      lane.lastSound = t0 + k
      if (a && a.first < 0) a.first = t0 + k
      if (w && !said) {
        this.#watch = undefined
        const early = w.at - (t0 + k + lane.delay)
        said = { joined: i, skew: 0, early: early >= -lateWatch ? early : null }
      }
    }
    if (w && !said && t0 + quantum + lane.delay - w.at > lateWatch) this.#watch = undefined
    return said
  }

  #join(t0: number): JoinOut | undefined {
    const a = this.#arm
    if (!a) return
    const from = this.#lanes[a.from]
    const to = this.#lanes[a.to]
    // the frame after the last one's last sound
    const end = from.lastSound + 1
    if (this.#t - end < endRun) {
      // It sounds on (a part of a file cut late, or no end at all): after
      // holding long, the next one starts as it is, from now.
      if (a.first >= 0 && this.#t - a.first > this.#size / 4) {
        from.until = Math.min(from.until, t0)
        return this.#done(a.to, false)
      }
      return
    }
    // where the next one's first sound goes out: right after the last one's
    const at = end + from.delay
    if (a.first < 0) {
      // no sound yet: it started silent, or late
      if (at >= t0) return
      from.until = Math.min(from.until, at)
      this.#watch = { lane: a.to, at }
      return this.#done(a.to, false)
    }
    let tails = this.#tails
    if (at - maxTails >= t0) {
      // enough of the next one in to look for the tails, else wait if there is time
      if (this.#t > a.first + maxTails + maxLate + tailWindow + 1)
        tails = this.#tailsOf(from, at, a.first)
      else if (at - maxTails >= t0 + quantum) return
    }
    // Late (a gap), it goes out as soon as it can; the lookahead can take some.
    const out = Math.max(at - tails, t0)
    to.delay = Math.min(Math.max(out - a.first, endRun + 1), this.#size / 2)
    to.from = a.first + to.delay
    from.until = Math.min(from.until, Math.max(at, to.from))
    return this.#done(a.to, true)
  }

  // The overlap of the tails that joins the last song (lane `from`, whose
  // sound ends where `at` goes out) and the next one (from frame `first`)
  // with the least of a corner: the least energy in the second difference
  // of the sum, from just before the earliest join to just after the last.
  #tailsOf(from: Lane, at: number, first: number): number {
    const to = this.#lanes[this.#arm!.to]
    const lo = at - maxTails - 2
    const n = maxTails + maxLate + tailWindow + 4
    const mix = (lane: Lane, f: number): number => {
      const i = f & this.#mask
      return lane.ring[0][i] + lane.ring[1][i]
    }
    // the last one alone, then each overlap with the next one added
    const last = new Float32Array(n)
    for (let k = 0; k < n; k++) last[k] = lo + k < at ? mix(from, lo + k - from.delay) : 0
    let best = 0
    let least = Infinity
    for (let tails = -maxLate; tails <= maxTails; tails++) {
      // the next one's first sound goes out at at - tails
      const start = at - tails
      let e = 0
      let y0 = 0
      let y1 = 0
      for (let k = 0; k < n; k++) {
        const t = lo + k
        const y = last[k] + (t >= start ? mix(to, first + t - start) : 0)
        if (k >= 2) {
          const d = y - 2 * y1 + y0
          e += d * d
        }
        y0 = y1
        y1 = y
      }
      // none wins a tie: no resampling is the usual case
      if (e < least || (e === least && Math.abs(tails) < Math.abs(best))) {
        least = e
        best = tails
      }
    }
    this.#tails = best
    return best
  }

  // The next song is let through: held back by its overlap (`timed`), or
  // the usual way.
  #done(i: number, timed: boolean): JoinOut {
    const to = this.#lanes[i]
    if (!timed) to.reset()
    this.#arm = undefined
    const skew = to.delay - lookahead
    return { joined: i, skew, early: timed ? skew : null }
  }
}
