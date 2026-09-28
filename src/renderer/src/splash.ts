// The start banner's page (splash.html): the Ring style's own drawing, fed
// made-up levels, around the record. No peak caps: they trailed the tone.
// Main closes the window when the app shows.
import { BANDS, stepLevels } from './visualizer/analysis'
import { barColors } from './visualizer/colors'
import { drawStage, type StageView } from './visualizer/draw'
import { idleTarget } from './visualizer/idle-levels'
import { meter } from './visualizer/levels'

// the icon's navy and teal, as an album palette
const palette = ['#3d4178', '#4cc3c9', '#111216'] as [string, string, string]
const light = new URLSearchParams(location.search).get('theme') === 'light'
const colors = barColors({ dark: palette, light: palette }, light)

const canvas = document.querySelector('canvas')!
const dpr = window.devicePixelRatio || 1
const css = canvas.clientWidth
canvas.width = canvas.height = Math.round(css * dpr)
const size = canvas.width
const view: StageView = {
  ctx: canvas.getContext('2d')!,
  w: size,
  h: size,
  dpr,
  // the record is 52% of the page, and the ring starts 10px past it, as on the stage
  cover: { cx: size / 2, cy: size / 2, inner: (css * 0.26 + 10) * dpr },
  grads: new Map()
}

const target = new Float32Array(BANDS)

function frame(ms: number): void {
  idleTarget(ms, target)
  stepLevels(meter, target)
  drawStage(view, 'ring', colors, false)
  requestAnimationFrame(frame)
}

if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  idleTarget(0, target)
  stepLevels(meter, target)
  drawStage(view, 'ring', colors, false)
} else requestAnimationFrame(frame)
