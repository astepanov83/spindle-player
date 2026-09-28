// The frame loop's stop and restart rules, with a fake requestAnimationFrame,
// a fake engine and a fake drawStage. Frames run only when the test says so.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  // the analyser's answer: loud, so the bars stand high while playing
  db: -30,
  // what happened, in order, across stages
  log: [] as string[]
}))

vi.mock('../audio/engine', () => ({
  engine: {
    context: { sampleRate: 48000 },
    analyser: {
      frequencyBinCount: 2048,
      fftSize: 4096,
      getFloatFrequencyData: (a: Float32Array) => a.fill(fake.db),
      getFloatTimeDomainData: (a: Float32Array) => a.fill(fake.db > -100 ? 0.5 : 0)
    }
  }
}))

vi.mock('./draw', () => ({
  drawStage: vi.fn((v: { el: { id: string }; w: number }) =>
    fake.log.push(`draw ${v.el.id} ${v.w}`)
  )
}))

// requestAnimationFrame that only runs when frame() is called
let pending: ((now: number) => void) | undefined
let clock = 1000
let rafIds = 0
vi.stubGlobal('requestAnimationFrame', (cb: (now: number) => void) => {
  pending = cb
  return ++rafIds
})
vi.stubGlobal('cancelAnimationFrame', () => (pending = undefined))
vi.stubGlobal('performance', { now: () => clock })

const docListeners: Record<string, () => void> = {}
const doc = {
  visibilityState: 'visible',
  addEventListener: (type: string, fn: () => void) => (docListeners[type] = fn)
}
vi.stubGlobal('document', doc)

// devicePixelRatio and the query that watches it
let dprChange: (() => void) | undefined
const queries: string[] = []
vi.stubGlobal('window', { devicePixelRatio: 1 })
vi.stubGlobal('matchMedia', (q: string) => ({
  addEventListener: (_: string, fn: () => void) => {
    queries.push(q)
    dprChange = fn
  }
}))

const { addStage, setLook } = await import('./loop')
type StageHandle = ReturnType<typeof addStage>
const { meter } = await import('./levels')
const { clear } = await import('./analysis')

const colors = { c1: '#ff0000', c2: '#00ff00', fade: 0.4 }

// Runs the frame that was asked for, if any. True if there was one.
function frame(): boolean {
  const cb = pending
  pending = undefined
  clock += 16
  cb?.(clock)
  return !!cb
}

// Runs frames until the loop stops asking, at most `max`. Gives how many ran.
function runOut(max = 1000): number {
  let n = 0
  while (n < max && frame()) n++
  return n
}

type FakeStage = { h: StageHandle; canvas: { width: number; height: number } }

function fakeStage(id: string, withCover = false): FakeStage {
  const el = {
    id,
    style: { setProperty: (k: string, v: string) => fake.log.push(`set ${id} ${k} ${v}`) },
    getBoundingClientRect: () => {
      fake.log.push(`read ${id}`)
      return { left: 0, top: 0, width: 200, height: 100 }
    }
  }
  const canvas = { width: 0, height: 0, getContext: () => ({}) }
  const cover = withCover
    ? { getBoundingClientRect: () => ({ left: 50, top: 0, width: 100, height: 100 }) }
    : null
  const h = addStage(
    el as unknown as HTMLElement,
    canvas as unknown as HTMLCanvasElement,
    cover as unknown as HTMLElement | null
  )
  return { h, canvas }
}

let stops: (() => void)[] = []

beforeEach(() => {
  for (const s of stops) s()
  stops = []
  // let the busy time of an earlier test run out
  clock += 10_000
  doc.visibilityState = 'visible'
  fake.db = -30
  fake.log = []
  clear(meter)
  setLook({ style: 'ring', colors, playing: false })
  runOut()
  fake.log = []
})

function shownStage(id = 'a', withCover = false): FakeStage {
  const s = fakeStage(id, withCover)
  stops.push(s.h.remove)
  s.h.resized(200, 100)
  return s
}

describe('the frame loop', () => {
  it('asks for nothing until a stage has a size, then draws it', () => {
    const s = fakeStage('a')
    stops.push(s.h.remove)
    expect(frame()).toBe(false)
    s.h.resized(200, 100)
    expect(frame()).toBe(true)
    expect(fake.log).toContain('draw a 200')
    expect(s.canvas.width).toBe(200)
    expect(s.canvas.height).toBe(100)
  })

  it('keeps going while playing, and stops once paused and settled', () => {
    shownStage()
    setLook({ style: 'ring', colors, playing: true })
    for (let i = 0; i < 50; i++) expect(frame()).toBe(true)
    setLook({ style: 'ring', colors, playing: false })
    const n = runOut()
    // the peak caps take the longest: about 1.4s at 60 frames a second
    expect(n).toBeGreaterThan(40)
    expect(n).toBeLessThan(150)
    expect(meter.levels.every((v) => v === 0)).toBe(true)
    // the last frame drew the resting look
    expect(fake.log.at(-1)).toBe('draw a 200')
  })

  it('draws once more with the style Off, with no glow, then stops', () => {
    shownStage()
    setLook({ style: 'ring', colors, playing: true })
    for (let i = 0; i < 5; i++) frame()
    setLook({ style: 'off', colors, playing: true })
    fake.log = []
    // the cover still changes size for a while after a style change
    const n = runOut()
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThanOrEqual(Math.ceil(600 / 16) + 1)
    expect(fake.log).toContain('set a --bass 0.000')
    expect(frame()).toBe(false)
  })

  it('stops with no stage on screen, even while playing', () => {
    const s = shownStage()
    setLook({ style: 'ring', colors, playing: true })
    runOut(5)
    // a tab hid it
    s.h.resized(0, 0)
    fake.log = []
    expect(runOut()).toBe(1)
    expect(fake.log.filter((l) => l.startsWith('draw'))).toEqual([])
    // it shows again
    s.h.resized(200, 100)
    expect(frame()).toBe(true)
    expect(frame()).toBe(true)
  })

  it('sleeps while the page is hidden and starts again when it shows', () => {
    shownStage()
    setLook({ style: 'ring', colors, playing: true })
    frame()
    doc.visibilityState = 'hidden'
    docListeners.visibilitychange()
    expect(frame()).toBe(false)
    // nothing wakes it while hidden
    setLook({ style: 'spectrum', colors, playing: true })
    expect(frame()).toBe(false)
    doc.visibilityState = 'visible'
    docListeners.visibilitychange()
    expect(frame()).toBe(true)
  })

  it('draws one frame for new colors while stopped', () => {
    shownStage()
    setLook({ style: 'ring', colors: { ...colors, c1: '#0000ff' }, playing: false })
    expect(runOut()).toBe(1)
    // the same colors in a new object are no change
    setLook({ style: 'ring', colors: { ...colors, c1: '#0000ff' }, playing: false })
    expect(runOut()).toBe(1)
  })

  it('keeps drawing for 600ms after a style change while stopped', () => {
    shownStage()
    setLook({ style: 'spectrum', colors, playing: false })
    const n = runOut()
    expect(n).toBeGreaterThanOrEqual(Math.floor(600 / 16))
    expect(n).toBeLessThanOrEqual(Math.ceil(600 / 16) + 1)
  })

  it('draws again after a resize while stopped, at the new size', () => {
    const s = shownStage()
    runOut()
    fake.log = []
    s.h.resized(300, 150)
    expect(runOut()).toBe(1)
    expect(fake.log).toContain('draw a 300')
    expect(s.canvas.width).toBe(300)
  })

  it('takes device pixels from the browser when it gives them', () => {
    const s = shownStage()
    s.h.resized(200, 100, 401, 201)
    runOut()
    expect([s.canvas.width, s.canvas.height]).toEqual([401, 201])
  })

  it('picks up a new devicePixelRatio while stopped', () => {
    const s = shownStage()
    runOut()
    expect(queries.at(-1)).toBe('(resolution: 1dppx)')
    ;(window as { devicePixelRatio: number }).devicePixelRatio = 2
    dprChange!()
    expect(runOut()).toBe(1)
    expect([s.canvas.width, s.canvas.height]).toEqual([400, 200])
    // watches the new ratio from now on
    expect(queries.at(-1)).toBe('(resolution: 2dppx)')
    ;(window as { devicePixelRatio: number }).devicePixelRatio = 1
    dprChange!()
    runOut()
  })

  it('reads the covers of all stages before it writes to any', () => {
    shownStage('a', true)
    shownStage('b', true)
    fake.log = []
    setLook({ style: 'ring', colors, playing: true })
    frame()
    const firstWrite = fake.log.findIndex((l) => l.startsWith('set') || l.startsWith('draw'))
    const lastRead = fake.log.findLastIndex((l) => l.startsWith('read'))
    expect(lastRead).toBeGreaterThan(-1)
    expect(lastRead).toBeLessThan(firstWrite)
  })

  it('reads the cover only after it moved, once the style change is over', () => {
    const s = shownStage('a', true)
    setLook({ style: 'ring', colors, playing: true })
    clock += 1000
    frame()
    fake.log = []
    frame()
    frame()
    expect(fake.log.filter((l) => l.startsWith('read'))).toEqual([])
    s.h.moved()
    frame()
    expect(fake.log.filter((l) => l.startsWith('read'))).toEqual(['read a'])
  })

  it('sets --bass only when it changes', () => {
    const s = shownStage()
    runOut()
    expect(fake.log).toContain('set a --bass 0.000')
    fake.log = []
    // redrawn at rest after a resize: the glow is still 0
    s.h.resized(300, 150)
    runOut()
    expect(fake.log).toEqual(['draw a 300'])
  })
})
