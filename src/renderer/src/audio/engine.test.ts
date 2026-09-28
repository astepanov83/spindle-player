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
class FakeContext {
  destination = {}
  createAnalyser = (): unknown => ({ ...(node() as object), fftSize: 0 })
  createGain = (): unknown => ({ ...(node() as object), gain: { value: 1 } })
  createMediaElementSource = node
  resume = (): Promise<void> => Promise.resolve()
}

vi.stubGlobal('Audio', FakeAudio)
vi.stubGlobal('AudioContext', FakeContext)
vi.stubGlobal('HTMLMediaElement', { HAVE_METADATA: 1 })
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

const { AudioEngine } = await import('./engine')

let e: InstanceType<typeof AudioEngine>
let el: FakeAudio
let got: string[]

beforeEach(() => {
  vi.useFakeTimers()
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
    error: (x) => got.push(`error ${x.code}${x.gone ? ' gone' : ''}`)
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
