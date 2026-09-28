// The visualizer's frame loop. Outside Svelte on purpose (decision 17): one
// analysis step per frame, then a draw per visible stage, and --bass set on
// each stage directly. The stores only tell it what changed.
//
// It runs only while something moves: it stops once paused and settled, when
// the window is hidden or minimized, with the style Off, or with no stage on screen.
import type { VisualizerStyle } from '../../../shared/settings'
import { engine } from '../audio/engine'
import { analyse, bandEdges, bassLevel, clear, rest, sampleWave, settled } from './analysis'
import type { BarColors } from './colors'
import { drawStage } from './draw'
import { meter } from './levels'

export interface Look {
  style: VisualizerStyle
  colors: BarColors
  playing: boolean
}

const stages = new Set<HTMLElement>()
let look: Look = { style: 'off', colors: { c1: '#000', c2: '#000', fade: 0.4 }, playing: false }
let raf = 0
// keep drawing until then, for the cover's size change after a style change
let busyUntil = 0

let edges: Int32Array | undefined
let freq: Float32Array<ArrayBuffer> | undefined
let time: Float32Array<ArrayBuffer> | undefined

// Also true while minimized: checked on Linux X11 (kwin), where a minimized
// window fires visibilitychange, so main doesn't need to tell us.
function hidden(): boolean {
  return document.visibilityState === 'hidden'
}

// Asks for a frame, unless one is coming or nothing can be seen.
export function wake(busyMs = 0): void {
  if (busyMs) busyUntil = Math.max(busyUntil, performance.now() + busyMs)
  if (!raf && !hidden()) raf = requestAnimationFrame(frame)
}

function sleep(): void {
  cancelAnimationFrame(raf)
  raf = 0
}

export function setLook(next: Look): void {
  const restyled = next.style !== look.style
  look = next
  if (look.style === 'off') clear(meter)
  // the cover's size moves for 0.45s after a style change
  wake(restyled ? 600 : 0)
}

// A stage on screen. Returns the function that removes it.
export function addStage(stage: HTMLElement): () => void {
  stages.add(stage)
  wake()
  return () => {
    stages.delete(stage)
  }
}

document.addEventListener('visibilitychange', () => {
  if (hidden()) sleep()
  else wake()
})

function readAnalyser(): void {
  const a = engine.analyser
  if (!edges || !freq || !time) {
    edges = bandEdges(engine.context.sampleRate, a.frequencyBinCount)
    freq = new Float32Array(a.frequencyBinCount)
    time = new Float32Array(a.fftSize)
  }
  a.getFloatFrequencyData(freq)
  analyse(meter, freq, edges)
  a.getFloatTimeDomainData(time)
  sampleWave(time, meter.wave)
}

function frame(now: number): void {
  raf = 0
  const { style, colors, playing } = look
  const on = style !== 'off'
  if (on && playing) readAnalyser()
  else if (on) rest(meter)
  const still = !playing && settled(meter)
  const bass = on ? bassLevel(meter.levels).toFixed(3) : '0'

  let shown = false
  for (const stage of stages) {
    // offsetParent is null inside a hidden tab
    if (!stage.offsetParent) continue
    shown = true
    if (stage.style.getPropertyValue('--bass') !== bass) stage.style.setProperty('--bass', bass)
    drawStage(stage, style, colors)
  }

  if (now < busyUntil || (shown && on && !still)) wake()
}
