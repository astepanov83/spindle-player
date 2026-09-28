// The visualizer's frame loop. Outside Svelte on purpose (decision 17): one
// analysis step per frame, then a draw per visible stage, and --bass set on
// each stage directly. The stores only tell it what changed.
//
// It runs only while something moves: it stops once paused and settled, when
// the window is hidden or minimized, with the style Off, or with no stage on screen.
//
// Stage sizes come from a ResizeObserver (Stage.svelte), not from reading the
// layout each frame. The cover's place is read only after something moved it,
// and all reads come before the frame's first write, so a frame never makes
// the browser work out styles twice.
import type { VisualizerStyle } from '../../../shared/settings'
import { engine } from '../audio/engine'
import { analyse, bandEdges, bassLevel, clear, motions, rest, sampleWave, settle } from './analysis'
import type { BarColors } from './colors'
import { drawStage, type StageView } from './draw'
import { meter } from './levels'

export interface Look {
  style: VisualizerStyle
  colors: BarColors
  playing: boolean
}

// What Stage.svelte gets back for its stage.
export interface StageHandle {
  // The canvas's size in CSS pixels, and in device pixels when the browser
  // gives them (devicePixelContentBoxSize). Zero means it can't be seen.
  resized(cssW: number, cssH: number, devW?: number, devH?: number): void
  // the cover moved or changed size (its transition ended)
  moved(): void
  remove(): void
}

interface Stage extends StageView {
  el: HTMLElement
  canvas: HTMLCanvasElement
  coverEl: HTMLElement | null
  cssW: number
  cssH: number
  // the cover's place must be read again
  measure: boolean
  // --bass as last set, in thousandths
  bass: number
}

const stages: Stage[] = []
let look: Look = { style: 'off', colors: { c1: '#000', c2: '#000', fade: 0.4 }, playing: false }
let raf = 0
// keep drawing until then, for the cover's size change after a style change
let busyUntil = 0
let dpr = window.devicePixelRatio || 1

let edges: Int32Array | undefined
let freq: Float32Array<ArrayBuffer> | undefined
let time: Float32Array<ArrayBuffer> | undefined

// --bass values as text, made once instead of a new string every frame
const bassText = Array.from({ length: 1001 }, (_, i) => (i / 1000).toFixed(3))

// Also true while minimized: checked on Linux X11 (kwin), where a minimized
// window fires visibilitychange, so main doesn't need to tell us.
function hidden(): boolean {
  return document.visibilityState === 'hidden'
}

// Asks for a frame, unless one is coming or nothing can be seen.
function wake(busyMs = 0): void {
  if (busyMs) busyUntil = Math.max(busyUntil, performance.now() + busyMs)
  if (!raf && !hidden()) raf = requestAnimationFrame(frame)
}

function sleep(): void {
  cancelAnimationFrame(raf)
  raf = 0
}

function sameColors(a: BarColors, b: BarColors): boolean {
  return a.c1 === b.c1 && a.c2 === b.c2 && a.fade === b.fade
}

export function setLook(next: Look): void {
  const restyled = next.style !== look.style
  const recolored = !sameColors(next.colors, look.colors)
  look = next
  for (const s of stages) {
    if (restyled || recolored) s.grads.clear()
    if (restyled) s.measure = true
  }
  if (look.style === 'off') clear(meter)
  // the cover's size moves for 0.45s after a style change
  wake(restyled ? 600 : 0)
}

// A stage on screen: its element, its canvas, and the cover on a big stage.
// It is drawn once its first size comes.
export function addStage(
  el: HTMLElement,
  canvas: HTMLCanvasElement,
  coverEl: HTMLElement | null
): StageHandle {
  const ctx = canvas.getContext('2d')
  if (!ctx) return { resized: () => {}, moved: () => {}, remove: () => {} }
  const s: Stage = {
    el,
    canvas,
    coverEl,
    ctx,
    w: 0,
    h: 0,
    dpr,
    cover: coverEl ? { cx: 0, cy: 0, inner: 0 } : null,
    grads: new Map(),
    cssW: 0,
    cssH: 0,
    measure: true,
    bass: -1
  }
  stages.push(s)
  return {
    resized(cssW, cssH, devW, devH) {
      s.cssW = cssW
      s.cssH = cssH
      fitToDpr(s, devW, devH)
      s.measure = true
      wake()
    },
    moved() {
      s.measure = true
      wake()
    },
    remove() {
      const i = stages.indexOf(s)
      if (i >= 0) stages.splice(i, 1)
    }
  }
}

// The canvas size in device pixels, from the browser's numbers or from dpr.
function fitToDpr(s: Stage, devW?: number, devH?: number): void {
  const w = devW ?? Math.round(s.cssW * dpr)
  const h = devH ?? Math.round(s.cssH * dpr)
  if (w !== s.w || h !== s.h || s.dpr !== dpr) s.grads.clear()
  s.w = w
  s.h = h
  s.dpr = dpr
}

// A new devicePixelRatio (moved to another screen, zoom) while nothing plays
// would otherwise wait for the next resize. The query matches only the ratio
// it was made with, so it is made again after each change.
function watchDpr(): void {
  matchMedia(`(resolution: ${dpr}dppx)`).addEventListener(
    'change',
    () => {
      dpr = window.devicePixelRatio || 1
      for (const s of stages) {
        // from dpr until the ResizeObserver gives device pixels again, if it does
        fitToDpr(s)
        s.measure = true
      }
      watchDpr()
      wake()
    },
    { once: true }
  )
}
watchDpr()

document.addEventListener('visibilitychange', () => {
  if (hidden()) sleep()
  else wake()
})

function readAnalyser(style: VisualizerStyle): void {
  const a = engine.analyser
  if (!edges || !freq || !time) {
    edges = bandEdges(engine.context.sampleRate, a.frequencyBinCount)
    freq = new Float32Array(a.frequencyBinCount)
    time = new Float32Array(a.fftSize)
  }
  a.getFloatFrequencyData(freq)
  analyse(meter, freq, edges, motions[style])
  a.getFloatTimeDomainData(time)
  sampleWave(time, meter.wave)
}

// Where the cover's center is on the canvas, and the ring's inner radius.
function measureCover(s: Stage): void {
  const spot = s.cover
  if (!spot || !s.coverEl) return
  const cr = s.coverEl.getBoundingClientRect()
  const sr = s.el.getBoundingClientRect()
  // device pixels per CSS pixel on this canvas
  const kx = s.cssW ? s.w / s.cssW : dpr
  const ky = s.cssH ? s.h / s.cssH : dpr
  spot.cx = (cr.left + cr.width / 2 - sr.left) * kx
  spot.cy = (cr.top + cr.height / 2 - sr.top) * ky
  spot.inner = (cr.width / 2 + 10) * kx
  s.measure = false
}

function frame(now: number): void {
  raf = 0
  const { style, colors, playing } = look
  const on = style !== 'off'
  if (on && playing) readAnalyser(style)
  else if (on) rest(meter, motions[style])
  const still = !playing && settle(meter)
  const bass = on ? Math.round(Math.min(1, bassLevel(meter.levels)) * 1000) : 0
  const busy = now < busyUntil

  // reads first
  let shown = false
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]
    if (!s.w || !s.h) continue
    shown = true
    // the cover moves every frame while it changes size
    if (s.measure || busy) measureCover(s)
  }

  // then writes
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]
    if (!s.w || !s.h) continue
    if (s.canvas.width !== s.w || s.canvas.height !== s.h) {
      s.canvas.width = s.w
      s.canvas.height = s.h
    }
    if (s.bass !== bass) {
      s.bass = bass
      s.el.style.setProperty('--bass', bassText[bass])
    }
    drawStage(s, style, colors)
  }

  if (busy || (shown && on && !still)) wake()
}
