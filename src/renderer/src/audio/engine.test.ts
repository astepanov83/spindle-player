// The engine with a fake <audio> element and Web Audio: parts of a file, the
// end timer, the handoff to the next part, and the ?decode retry.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Just enough of HTMLAudioElement. Tests move `currentTime` and fire events.
class FakeAudio extends EventTarget {
  crossOrigin = ''
  preload = ''
  currentTime = 0
  duration = NaN
  paused = true
  ended = false
  seeking = false
  readyState = 0
  playbackRate = 1
  error: { code: number; message: string } | null = null
  #src: string | null = null
  loads: string[] = []
  get src(): string {
    return this.#src ?? ''
  }
  set src(v: string) {
    this.#src = v
    this.loads.push(v)
    this.readyState = 0
    this.error = null
  }
  getAttribute(n: string): string | null {
    return n === 'src' ? this.#src : null
  }
  removeAttribute(): void {
    this.#src = null
  }
  // calls of load(), which clear() makes to stop the download
  reloads = 0
  load(): void {
    this.reloads++
  }
  play(): Promise<void> {
    this.paused = false
    this.dispatchEvent(new Event('playing'))
    return Promise.resolve()
  }
  pause(): void {
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }
  fire(type: string): void {
    this.dispatchEvent(new Event(type))
  }
  // the file's length is known
  meta(duration: number): void {
    this.duration = duration
    this.readyState = 1
    this.fire('loadedmetadata')
    this.fire('durationchange')
  }
}

const node = (): unknown => ({ connect: (n: unknown) => n })
// a gain's value, and the changes set for later: [value, context time]
class FakeParam {
  value = 1
  later: [number, number][] = []
  // where setTargetAtTime glides to, from when
  glide: [number, number] | undefined
  setValueAtTime(v: number, t: number): void {
    this.later.push([v, t])
  }
  setTargetAtTime(v: number, t: number): void {
    this.glide = [v, t]
  }
  cancelScheduledValues(): void {
    this.later = []
    this.glide = undefined
  }
  // the value it ends up at
  get level(): number {
    return this.glide?.[0] ?? this.value
  }
}
// every gain made, in order: the volume, then each element's
const params: FakeParam[] = []
// How the join's worklet loads: never (the elements go straight on), or it
// fails (a new graph then plays at once, without it).
let worklet: 'hang' | 'fail' = 'hang'
// every context made, in order: one per graph
const contexts: FakeContext[] = []
class FakeContext {
  destination = {}
  sampleRate: number
  state = 'running'
  baseLatency = 0
  outputLatency = 0
  // this graph's gains (the volume, then each element's) and elements
  gains: FakeParam[] = []
  els: FakeAudio[] = []
  constructor(o: { sampleRate: number }) {
    this.sampleRate = o.sampleRate
    contexts.push(this)
  }
  createAnalyser = (): unknown => ({ ...(node() as object), fftSize: 0 })
  currentTime = 0
  createGain = (): unknown => {
    const gain = new FakeParam()
    params.push(gain)
    this.gains.push(gain)
    return { ...(node() as object), gain }
  }
  createMediaElementSource = (el: FakeAudio): unknown => {
    this.els.push(el)
    return node()
  }
  resume = (): Promise<void> => Promise.resolve()
  close = (): Promise<void> => {
    this.state = 'closed'
    return Promise.resolve()
  }
  audioWorklet = {
    addModule: (): Promise<void> =>
      worklet === 'fail' ? Promise.reject(new Error('no worklet')) : new Promise(() => {})
  }
}

// every element made, in order: the engine makes two
const made: FakeAudio[] = []
vi.stubGlobal(
  'Audio',
  class extends FakeAudio {
    constructor() {
      super()
      made.push(this)
    }
  }
)
vi.stubGlobal('AudioContext', FakeContext)
vi.stubGlobal('HTMLMediaElement', { HAVE_METADATA: 1, HAVE_FUTURE_DATA: 3 })
vi.stubGlobal('addEventListener', () => {})
vi.stubGlobal('removeEventListener', () => {})
// main's answer to the HEAD that asks whether a failed file is still there
let headStatus = 200
const heads: string[] = []
// a HEAD that never answers in time
let headTimeout = false
vi.stubGlobal('fetch', async (url: string, init: { method: string; signal?: AbortSignal }) => {
  heads.push(`${init.method} ${url}`)
  expect(init.signal).toBeDefined()
  if (headTimeout) throw Object.assign(new Error('timed out'), { name: 'TimeoutError' })
  return { status: headStatus }
})

vi.mock('./join-worklet?worker&url', () => ({ default: 'join.js' }))
const { AudioEngine } = await import('./engine')

let e: InstanceType<typeof AudioEngine>
let el: FakeAudio
let got: string[]

beforeEach(() => {
  vi.useFakeTimers()
  made.length = 0
  params.length = 0
  contexts.length = 0
  worklet = 'hang'
  e = new AudioEngine()
  el = e.el as unknown as FakeAudio
  got = []
  headStatus = 200
  headTimeout = false
  heads.length = 0
  e.on({
    time: (t) => got.push(`time ${t.toFixed(2)}`),
    duration: (d) => got.push(`duration ${d}`),
    ended: () => got.push('ended'),
    error: (x) => got.push(`error ${x.code}${x.gone ? ' gone' : ''}`),
    nextStarted: () => got.push('next')
  })
})

afterEach(() => vi.useRealTimers())

// Loads a track of an image (100-160 s of a 300 s file) and starts it.
function playPart(): void {
  e.load('spindle://media/img', 0, { start: 100, end: 160 })
  el.meta(300)
  e.play()
  got = []
}

describe('a part of a file', () => {
  it('starts at the part, and gives times and length from it', () => {
    e.load('spindle://media/img', 5, { start: 100, end: 160 })
    el.meta(300)
    expect(el.currentTime).toBe(105)
    expect(got).toContain('duration 60')
    el.currentTime = 130
    el.fire('timeupdate')
    expect(got.at(-1)).toBe('time 30.00')
  })

  it('stops at its end by the timer, between two timeupdates', () => {
    playPart()
    el.currentTime = 159.5
    el.fire('timeupdate')
    expect(got).toEqual(['time 59.50'])
    // the clock runs on; the timer comes at the end
    el.currentTime = 160
    vi.advanceTimersByTime(500)
    expect(got).toEqual(['time 59.50', 'ended'])
  })

  it('sends the end once, not again on a later timeupdate or the file’s own ended', () => {
    playPart()
    el.currentTime = 160.01
    el.fire('timeupdate')
    el.currentTime = 160.2
    el.fire('timeupdate')
    el.fire('ended')
    expect(got.filter((g) => g === 'ended')).toHaveLength(1)
  })

  it('sends the file’s own ended for the last part (no end)', () => {
    e.load('spindle://media/img', 0, { start: 250 })
    el.meta(300)
    e.play()
    got = []
    el.currentTime = 300
    el.fire('ended')
    expect(got).toEqual(['ended'])
  })

  it('a seek while the end timer waits moves the end, and it comes again later', () => {
    playPart()
    el.currentTime = 159.9
    el.fire('timeupdate')
    e.seek(10)
    expect(el.currentTime).toBe(110)
    el.fire('seeked')
    // the old timer fires at 159.9 + 0.1 s, but the element is at 110 now
    vi.advanceTimersByTime(200)
    expect(got).not.toContain('ended')
    el.currentTime = 160
    vi.advanceTimersByTime(1000)
    expect(got.filter((g) => g === 'ended')).toHaveLength(1)
  })

  it('hands off to the next part with no reload, and times follow the new part', () => {
    playPart()
    // the timer set at the start looks again within a second
    el.currentTime = 160
    vi.advanceTimersByTime(1000)
    expect(got).toContain('ended')
    got = []
    e.continueWith({ start: 160, end: 200 })
    expect(el.loads).toEqual(['spindle://media/img'])
    expect(got).toEqual(['duration 40', 'time 0.00'])
    el.currentTime = 199.99
    vi.advanceTimersByTime(1000)
    expect(got.at(-1)).toBe('time 0.00')
    // 10 ms left: a short timer for them
    el.currentTime = 200
    vi.advanceTimersByTime(10)
    expect(got.at(-1)).toBe('ended')
  })

  it('loads another part of the same file as a seek', () => {
    playPart()
    e.load('spindle://media/img', 2, { start: 200, end: 250 })
    expect(el.loads).toEqual(['spindle://media/img'])
    expect(el.currentTime).toBe(202)
    expect(got).toEqual(['duration 50', 'time 2.00'])
  })

  it('loads the file again for another file, or after an error', () => {
    playPart()
    e.load('spindle://media/other', 0)
    expect(el.loads).toEqual(['spindle://media/img', 'spindle://media/other'])
    el.error = { code: 2, message: '' }
    e.load('spindle://media/other', 0)
    expect(el.loads).toHaveLength(3)
  })

  it('play() at a part’s end starts the part again', () => {
    playPart()
    el.currentTime = 160
    vi.advanceTimersByTime(1000)
    expect(got).toContain('ended')
    e.pause()
    e.play()
    expect(el.currentTime).toBe(100)
  })

  it('stops the end timer when paused', () => {
    playPart()
    el.currentTime = 159
    el.fire('timeupdate')
    e.pause()
    el.currentTime = 161
    vi.advanceTimersByTime(5000)
    expect(got).not.toContain('ended')
  })
})

describe('a file Chromium can’t read', () => {
  it('is loaded once more as ?decode at the same place, still playing', () => {
    e.load('spindle://media/wav', 30)
    e.play()
    el.error = { code: 4, message: 'no supported streams' }
    el.fire('error')
    expect(el.loads).toEqual(['spindle://media/wav', 'spindle://media/wav?decode'])
    expect(el.paused).toBe(false)
    el.meta(100)
    expect(el.currentTime).toBe(30)
    expect(got.filter((g) => g.startsWith('error'))).toEqual([])
  })

  it('fails for real when the decoded file fails too: a format, when the file is there', async () => {
    e.load('spindle://media/bad', 0)
    el.error = { code: 4, message: '' }
    el.fire('error')
    el.error = { code: 4, message: '' }
    el.fire('error')
    await vi.runAllTimersAsync()
    expect(got).toEqual(['error 4'])
    // asked about the file itself, not the ?decode one
    expect(heads).toEqual(['HEAD spindle://media/bad'])
  })

  it('says the file is gone when main answers 404', async () => {
    headStatus = 404
    e.load('spindle://media/gone', 0)
    el.error = { code: 4, message: '' }
    el.fire('error')
    el.error = { code: 4, message: '' }
    el.fire('error')
    await vi.runAllTimersAsync()
    expect(got).toEqual(['error 4 gone'])
  })

  it("says the file can't be read when main doesn't answer in time", async () => {
    headTimeout = true
    e.load('spindle://media/nas', 0)
    el.error = { code: 4, message: '' }
    el.fire('error')
    el.error = { code: 4, message: '' }
    el.fire('error')
    await vi.runAllTimersAsync()
    expect(got).toEqual(['error 4 gone'])
  })

  it('drops the error of a song that is no longer loaded', async () => {
    e.load('spindle://media/x', 0)
    el.error = { code: 4, message: '' }
    el.fire('error')
    el.error = { code: 4, message: '' }
    el.fire('error')
    e.load('spindle://media/y', 0)
    await vi.runAllTimersAsync()
    expect(got).toEqual([])
  })

  it('a network error is not retried, and is the file not coming through, with no HEAD', async () => {
    e.load('spindle://media/x', 0)
    el.error = { code: 2, message: '' }
    el.fire('error')
    await vi.runAllTimersAsync()
    expect(el.loads).toEqual(['spindle://media/x'])
    expect(got).toEqual(['error 2 gone'])
    expect(heads).toEqual([])
  })

  it('the same file is a seek after the retry, not a load of the undecoded file', () => {
    e.load('spindle://media/wav', 0, { start: 0, end: 50 })
    el.error = { code: 4, message: '' }
    el.fire('error')
    el.meta(100)
    e.load('spindle://media/wav', 0, { start: 50 })
    expect(el.loads).toEqual(['spindle://media/wav', 'spindle://media/wav?decode'])
    expect(el.currentTime).toBe(50)
  })
})

describe('a live stream', () => {
  const radio = 'spindle://radio/metal-only?stream=0'

  it('fails at once with the element’s error: no ?decode, no HEAD', async () => {
    e.load(radio, 0, undefined, { live: true })
    e.play()
    el.error = { code: 4, message: 'DEMUXER_ERROR_COULD_NOT_OPEN' }
    el.fire('error')
    await vi.runAllTimersAsync()
    expect(el.loads).toEqual([radio])
    expect(heads).toEqual([])
    expect(got).toEqual(['error 4'])
  })

  it('sends no length', () => {
    e.load(radio, 0, undefined, { live: true })
    el.meta(Infinity)
    el.duration = 12
    el.fire('durationchange')
    expect(got.filter((g) => g.startsWith('duration'))).toEqual([])
  })

  it('sends waiting', () => {
    const waits: string[] = []
    e.on({ waiting: () => waits.push('waiting') })
    e.load(radio, 0, undefined, { live: true })
    el.fire('waiting')
    expect(waits).toEqual(['waiting'])
  })

  it('opens a new connection when loaded again, even at the same address', () => {
    e.load(radio, 0, undefined, { live: true })
    e.load(radio, 0, undefined, { live: true })
    expect(el.loads).toEqual([radio, radio])
  })

  it('a song loaded after it is a file again', async () => {
    e.load(radio, 0, undefined, { live: true })
    e.load('spindle://media/wav', 0)
    el.error = { code: 4, message: '' }
    el.fire('error')
    expect(el.loads.at(-1)).toBe('spindle://media/wav?decode')
    el.meta(100)
    expect(got).toContain('duration 100')
  })
})

describe('the next song (ticket 087)', () => {
  // the element that is not playing
  const other = (): FakeAudio => made.find((a) => a !== (e.el as unknown as FakeAudio))!

  // A 100 s song playing, at `pos`.
  function playSong(pos: number): void {
    e.load('spindle://media/a', 0)
    el.meta(100)
    e.play()
    el.currentTime = pos
    got = []
  }

  // the other element has the next song's start in
  function ready(o: FakeAudio, duration = 50): void {
    o.meta(duration)
    o.readyState = 4
    o.fire('canplay')
  }

  it('loads 20 s before the end, in the other element', () => {
    playSong(50)
    e.setNext({ url: 'spindle://media/b' })
    el.fire('timeupdate')
    expect(other().loads).toEqual([])
    el.currentTime = 80
    el.fire('timeupdate')
    expect(other().loads).toEqual(['spindle://media/b'])
    expect(el.loads).toEqual(['spindle://media/a'])
  })

  it('a part of a file loads at its start', () => {
    playSong(90)
    e.setNext({ url: 'spindle://media/img', part: { start: 30, end: 60 } })
    const o = other()
    o.meta(300)
    expect(o.currentTime).toBe(30)
  })

  it('starts it just before the end, and its times and length are the ones sent then', () => {
    playSong(90)
    e.setNext({ url: 'spindle://media/b' })
    const o = other()
    ready(o)
    el.currentTime = 99.5
    el.fire('timeupdate')
    expect(o.paused).toBe(true)
    got = []
    // the timer reads the time again as it goes
    el.currentTime = 99.996
    vi.advanceTimersByTime(1000)
    expect(o.paused).toBe(false)
    expect(e.el).toBe(o)
    expect(got).toEqual(['next', 'duration 50', 'time 0.00'])
    // the last one's own events no longer go out
    got = []
    el.fire('ended')
    el.fire('timeupdate')
    expect(got).toEqual([])
    o.currentTime = 3
    o.fire('timeupdate')
    expect(got).toEqual(['time 3.00'])
  })

  it('the end of the song playing starts a ready next song instead of ending', () => {
    playSong(99)
    e.setNext({ url: 'spindle://media/b' })
    ready(other())
    el.fire('ended')
    expect(got).toEqual(['next', 'duration 50', 'time 0.00'])
  })

  it('a next song not ready at the end: the song ends as usual', () => {
    playSong(99)
    e.setNext({ url: 'spindle://media/b' })
    el.currentTime = 100
    el.fire('ended')
    expect(got).toEqual(['ended'])
  })

  it('does not start while paused', () => {
    playSong(99)
    e.setNext({ url: 'spindle://media/b' })
    ready(other())
    e.pause()
    el.currentTime = 99.999
    el.fire('timeupdate')
    vi.advanceTimersByTime(1000)
    expect(other().paused).toBe(true)
  })

  it('loading the song already loaded ahead takes it over, with no new load', () => {
    playSong(90)
    e.setNext({ url: 'spindle://media/b' })
    const o = other()
    ready(o)
    const a = el
    e.load('spindle://media/b', 0)
    expect(e.el).toBe(o)
    expect(o.loads).toEqual(['spindle://media/b'])
    // the last one is dropped
    expect(a.getAttribute('src')).toBe(null)
    expect(got).toEqual(['duration 50', 'time 0.00'])
  })

  it('another next song drops the one loaded; another part of its file is a seek', () => {
    playSong(90)
    e.setNext({ url: 'spindle://media/img', part: { start: 0, end: 30 } })
    const o = other()
    ready(o, 300)
    e.setNext({ url: 'spindle://media/img', part: { start: 30, end: 60 } })
    expect(o.loads).toEqual(['spindle://media/img'])
    expect(o.currentTime).toBe(30)
    e.setNext({ url: 'spindle://media/c' })
    expect(o.loads.at(-1)).toBe('spindle://media/c')
    e.setNext()
    expect(o.getAttribute('src')).toBe(null)
  })

  it('a next song that fails to load is left for its turn, and fails then as usual', async () => {
    playSong(90)
    e.setNext({ url: 'spindle://media/bad' })
    const o = other()
    o.error = { code: 4, message: '' }
    o.fire('error')
    // once more through ffmpeg, as for any song
    expect(o.loads).toEqual(['spindle://media/bad', 'spindle://media/bad?decode'])
    o.error = { code: 4, message: '' }
    o.fire('error')
    await vi.runAllTimersAsync()
    expect(got).toEqual([])
    expect(o.getAttribute('src')).toBe(null)
    // not loaded again while it is the same next song
    e.setNext({ url: 'spindle://media/bad' })
    el.fire('timeupdate')
    expect(o.loads).toHaveLength(2)
    got = []
    el.currentTime = 100
    el.fire('ended')
    expect(got).toEqual(['ended'])
  })

  it('the last song sounds out, then its element is free for the song after', () => {
    playSong(99)
    e.setNext({ url: 'spindle://media/b' })
    const first = other()
    ready(first, 10)
    el.fire('ended')
    // b plays; c is next, but the old element is still sounding out
    e.setNext({ url: 'spindle://media/c' })
    expect(el.loads).toEqual(['spindle://media/a'])
    vi.advanceTimersByTime(300)
    expect(el.loads).toEqual(['spindle://media/a', 'spindle://media/c'])
  })

  it('a part of a file followed by another file: the next one starts at its end, and the file stops', () => {
    e.load('spindle://media/img', 0, { start: 100, end: 160 })
    el.meta(300)
    e.play()
    el.currentTime = 150
    e.setNext({ url: 'spindle://media/b' })
    const o = other()
    ready(o)
    const img = el
    got = []
    el.currentTime = 159.999
    el.fire('timeupdate')
    expect(got).toEqual(['time 60.00', 'next', 'duration 50', 'time 0.00'])
    expect(e.el).toBe(o)
    // the image would play on into its next track: its element is let go
    vi.advanceTimersByTime(300)
    expect(img.getAttribute('src')).toBe(null)
  })

  it('a live stream drops the next song', () => {
    playSong(90)
    e.setNext({ url: 'spindle://media/b' })
    const o = other()
    e.load('spindle://radio/x?stream=0', 0, undefined, { live: true })
    expect(o.getAttribute('src')).toBe(null)
  })

  it('clear() drops both', () => {
    playSong(90)
    e.setNext({ url: 'spindle://media/b' })
    const o = other()
    e.clear()
    expect(el.getAttribute('src')).toBe(null)
    expect(o.getAttribute('src')).toBe(null)
  })
})

describe('each song’s level (ReplayGain, ticket 090)', () => {
  const gainOf = (a: unknown): FakeParam => params[1 + made.indexOf(a as FakeAudio)]
  const other = (): FakeAudio => made.find((a) => a !== (e.el as unknown as FakeAudio))!

  it('a song loads at its level, and one without is at 1', () => {
    e.load('spindle://media/a', 0, undefined, { gain: 0.5 })
    expect(gainOf(el).value).toBe(0.5)
    expect(gainOf(el).glide).toBeUndefined()
    e.load('spindle://media/b')
    expect(gainOf(el).value).toBe(1)
  })

  it('the volume is its own gain and stays apart', () => {
    e.load('spindle://media/a', 0, undefined, { gain: 0.5 })
    e.setVolume(0)
    expect(params[0].value).toBe(0)
    expect(gainOf(el).value).toBe(0.5)
  })

  it('the next song loads ahead at its own level and keeps it as it starts', () => {
    e.load('spindle://media/a', 0, undefined, { gain: 0.5 })
    el.meta(100)
    e.play()
    el.currentTime = 90
    e.setNext({ url: 'spindle://media/b', gain: 2 })
    const o = other()
    expect(o.loads).toEqual(['spindle://media/b'])
    expect(gainOf(o).value).toBe(2)
    expect(gainOf(el).value).toBe(0.5)
    o.meta(50)
    o.readyState = 4
    el.fire('ended')
    expect(e.el).toBe(o)
    expect(gainOf(o).level).toBe(2)
  })

  it('the same next song at another level is set again, with no new load', () => {
    e.load('spindle://media/a', 0)
    el.meta(100)
    e.play()
    el.currentTime = 90
    e.setNext({ url: 'spindle://media/b', gain: 2 })
    const o = other()
    e.setNext({ url: 'spindle://media/b', gain: 0.25 })
    expect(o.loads).toEqual(['spindle://media/b'])
    expect(gainOf(o).value).toBe(0.25)
  })

  it('load of the song loaded ahead takes the level it is given', () => {
    e.load('spindle://media/a', 0)
    el.meta(100)
    e.play()
    el.currentTime = 90
    e.setNext({ url: 'spindle://media/b', gain: 2 })
    const o = other()
    e.load('spindle://media/b', 0, undefined, { gain: 0.8 })
    expect(e.el).toBe(o)
    expect(gainOf(o).value).toBe(0.8)
  })

  it('the next part of a file and a new setting glide the song playing to its level', () => {
    e.load('spindle://media/img', 0, { start: 0, end: 60 }, { gain: 0.5 })
    el.meta(300)
    e.play()
    e.continueWith({ start: 60, end: 120 }, 0.7)
    expect(gainOf(el).glide?.[0]).toBe(0.7)
    e.setGain(1.2)
    expect(gainOf(el).level).toBe(1.2)
  })
})

describe('a graph per sample rate (ticket 091)', () => {
  const ctx = (): FakeContext => contexts.at(-1)!
  const playing = (): FakeAudio => e.el as unknown as FakeAudio

  beforeEach(() => {
    // a new graph plays once its join loaded or failed; here it fails
    worklet = 'fail'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  // A 100 s song at `rate` playing, at 90 s.
  async function playAt(rate: number | undefined, url = 'spindle://media/a'): Promise<void> {
    e.load(url, 0, undefined, { rate })
    playing().meta(100)
    e.play()
    await vi.advanceTimersByTimeAsync(0)
    playing().currentTime = 90
    got = []
  }

  function ready(o: FakeAudio): void {
    o.meta(50)
    o.readyState = 4
    o.fire('canplay')
  }

  it('starts at 44.1 kHz, and a song at another rate gets a graph at its rate', async () => {
    expect(contexts.map((c) => c.sampleRate)).toEqual([44100])
    expect(e.context).toBe(contexts[0])
    e.load('spindle://media/a', 0, undefined, { rate: 96000 })
    expect(contexts.map((c) => c.sampleRate)).toEqual([44100, 96000])
    expect(contexts[0].state).toBe('closed')
    expect(e.context).toBe(contexts[1])
    expect(e.analyser).not.toBeUndefined()
    // its own elements: an element stays with the context it was joined to
    expect(contexts[1].els).toContain(playing())
    expect(playing().loads).toEqual(['spindle://media/a'])
  })

  it('a new graph plays once its join is in', async () => {
    worklet = 'hang'
    e.load('spindle://media/a', 0, undefined, { rate: 48000 })
    playing().meta(100)
    e.play()
    await vi.advanceTimersByTimeAsync(10)
    expect(playing().paused).toBe(true)
    worklet = 'fail'
    e.load('spindle://media/b', 0, undefined, { rate: 96000 })
    e.play()
    expect(playing().paused).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(playing().paused).toBe(false)
  })

  it('keeps the graph for a song at its rate, with no rate, out of reach, or a stream', async () => {
    e.load('spindle://media/a', 0, undefined, { rate: 44100 })
    e.load('spindle://media/b')
    e.load('spindle://media/c', 0, undefined, { rate: 1000 })
    e.load('spindle://media/d', 0, undefined, { rate: 48000.5 })
    e.load('spindle://radio/x?stream=0', 0, undefined, { live: true, rate: 48000 })
    expect(contexts).toHaveLength(1)
    expect(playing().loads.at(-1)).toBe('spindle://radio/x?stream=0')
  })

  it('a next song at the same rate loads in the other element of the same graph', async () => {
    await playAt(48000)
    e.setNext({ url: 'spindle://media/b', rate: 48000 })
    expect(contexts).toHaveLength(2)
    expect(ctx().els.find((a) => a !== playing())!.loads).toEqual(['spindle://media/b'])
  })

  it('a next song at another rate loads in a new graph, starts there and the old one closes after its end', async () => {
    await playAt(44100)
    const a = playing()
    e.setNext({ url: 'spindle://media/b', rate: 96000 })
    const next = ctx()
    expect(next.sampleRate).toBe(96000)
    const o = next.els[0]
    expect(o.loads).toEqual(['spindle://media/b'])
    await vi.advanceTimersByTimeAsync(0)
    ready(o)
    a.currentTime = 99.999
    a.fire('timeupdate')
    expect(o.paused).toBe(false)
    expect(e.el).toBe(o)
    expect(e.context).toBe(next)
    expect(got).toEqual(['time 100.00', 'next', 'duration 50', 'time 0.00'])
    // the old graph sounds out its song, then closes
    expect(contexts[0].state).toBe('running')
    await vi.advanceTimersByTimeAsync(300)
    expect(contexts[0].state).toBe('closed')
    expect(a.getAttribute('src')).toBe(null)
    // the song after, at the new rate, goes in the new graph's other element
    o.currentTime = 40
    e.setNext({ url: 'spindle://media/c', rate: 96000 })
    expect(contexts).toHaveLength(2)
    expect(next.els[1].loads).toEqual(['spindle://media/c'])
  })

  it('a next song at another rate not ready at the end: the song ends, and its load takes over the new graph', async () => {
    await playAt(44100)
    e.setNext({ url: 'spindle://media/b', rate: 48000 })
    const next = ctx()
    const o = next.els[0]
    playing().currentTime = 100
    playing().fire('ended')
    expect(got).toEqual(['ended'])
    e.load('spindle://media/b', 0, undefined, { rate: 48000 })
    expect(e.el).toBe(o)
    expect(e.context).toBe(next)
    expect(o.loads).toEqual(['spindle://media/b'])
    expect(contexts[0].state).toBe('closed')
    expect(contexts).toHaveLength(2)
  })

  it('starts the next song in a new graph as close to the end as it can: what play() takes and the two delays', async () => {
    await playAt(44100)
    contexts[0].baseLatency = 0.01
    e.setNext({ url: 'spindle://media/b', rate: 48000 })
    ctx().baseLatency = 0.02
    await vi.advanceTimersByTimeAsync(0)
    const o = ctx().els[0]
    ready(o)
    // plainLead (no join here) 5 ms, plus 10 ms more delay in the new graph
    playing().currentTime = 99.98
    playing().fire('timeupdate')
    expect(o.paused).toBe(true)
    playing().currentTime = 99.984
    await vi.advanceTimersByTimeAsync(5)
    expect(o.paused).toBe(false)
  })

  it('starts the next song after the end when its graph takes less time to the speakers', async () => {
    await playAt(96000)
    ctx().baseLatency = 0.04
    e.setNext({ url: 'spindle://media/b', rate: 44100 })
    const o = ctx().els[0]
    await vi.advanceTimersByTimeAsync(0)
    ready(o)
    // 5 ms for play(), less 40 ms quicker: 35 ms after the end
    playing().currentTime = 100
    playing().fire('ended')
    expect(o.paused).toBe(true)
    expect(got).toEqual([])
    await vi.advanceTimersByTimeAsync(30)
    expect(o.paused).toBe(true)
    await vi.advanceTimersByTimeAsync(10)
    expect(o.paused).toBe(false)
    expect(got).toEqual(['next', 'duration 50', 'time 0.00'])
  })

  it('a start held after the end is dropped by a pause', async () => {
    await playAt(96000)
    ctx().baseLatency = 0.04
    e.setNext({ url: 'spindle://media/b', rate: 44100 })
    const o = ctx().els[0]
    await vi.advanceTimersByTimeAsync(0)
    ready(o)
    playing().currentTime = 100
    playing().fire('ended')
    e.pause()
    await vi.advanceTimersByTimeAsync(100)
    expect(o.paused).toBe(true)
  })

  it('another next song, or none, closes the graph made for the one before', async () => {
    await playAt(44100)
    e.setNext({ url: 'spindle://media/b', rate: 48000 })
    const b = ctx()
    e.setNext({ url: 'spindle://media/c', rate: 96000 })
    expect(b.state).toBe('closed')
    const c = ctx()
    expect(c.sampleRate).toBe(96000)
    e.setNext({ url: 'spindle://media/d' })
    expect(c.state).toBe('closed')
    expect(contexts[0].els.find((a) => a !== playing())!.loads).toEqual(['spindle://media/d'])
    e.setNext({ url: 'spindle://media/e', rate: 48000 })
    e.clear()
    expect(ctx().state).toBe('closed')
    expect(contexts[0].state).toBe('running')
  })

  it('a song loaded at a third rate closes both graphs', async () => {
    await playAt(44100)
    e.setNext({ url: 'spindle://media/b', rate: 48000 })
    e.load('spindle://media/c', 0, undefined, { rate: 96000 })
    expect(contexts.map((c) => [c.sampleRate, c.state])).toEqual([
      [44100, 'closed'],
      [48000, 'closed'],
      [96000, 'running']
    ])
  })

  it('a next song that fails to load closes its graph, and fails in its turn as usual', async () => {
    await playAt(44100)
    e.setNext({ url: 'spindle://media/bad', rate: 48000 })
    const b = ctx()
    const o = b.els[0]
    o.error = { code: 4, message: '' }
    o.fire('error')
    o.error = { code: 4, message: '' }
    o.fire('error')
    expect(b.state).toBe('closed')
  })

  it('the volume and each song’s level are set on a new graph', async () => {
    e.setVolume(0)
    await playAt(44100)
    e.setNext({ url: 'spindle://media/b', rate: 48000, gain: 0.5 })
    const b = ctx()
    // the volume, then each element's gain
    expect(b.gains[0].value).toBe(0)
    expect(b.gains[1].value).toBe(0.5)
    // a new volume reaches both graphs
    e.setVolume(50)
    expect(contexts[0].gains[0].value).toBe(0.25)
    expect(b.gains[0].value).toBe(0.25)
    e.load('spindle://media/c', 0, undefined, { rate: 96000, gain: 2 })
    expect(ctx().gains[0].value).toBe(0.25)
    expect(ctx().gains[1].value).toBe(2)
  })
})
