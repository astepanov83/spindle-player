// One draw function per style, over the same levels. Ported from the prototype.
// A stage with no cover (the small one in the bar) gets a compact version.
//
// These run every frame, so they make no new objects once warmed up: gradients
// are kept per stage (StageView.grads) and made again only after a resize or
// a new look.
import type { VisualizerStyle } from '../../../shared/settings'
import type { BarColors } from './colors'
import { ringAngle } from './analysis'
import { BANDS, WAVE_N, levels, peaks, wave } from './levels'

type Ctx = CanvasRenderingContext2D

// Where the cover sits on a big stage, in device pixels.
export interface CoverSpot {
  cx: number
  cy: number
  // the ring's inner radius: the cover's radius plus a gap
  inner: number
}

// What a draw needs about one stage. The frame loop (loop.ts) keeps it up to date.
export interface StageView {
  ctx: CanvasRenderingContext2D
  // canvas size in device pixels
  w: number
  h: number
  dpr: number
  // null on a stage with no cover
  cover: CoverSpot | null
  // Gradients by a key per style (see gradient()). Cleared by the loop when
  // the size, the style or the colors change.
  grads: Map<number, CanvasGradient>
}

// Keys for the gradients a style keeps. Ring and mirror bars keep one per
// whole pixel of length, so a key is that length (plus an offset for mirror).
const SPECTRUM_KEY = -1
const WAVE_KEY = -2
const MIRROR_KEY = 1 << 20

// A vertical gradient from `a` at y0 to `b` at y1, and `a` again at y2 if given.
function gradient(
  v: StageView,
  key: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  a: string,
  b: string,
  back = false
): CanvasGradient {
  let g = v.grads.get(key)
  if (!g) {
    g = v.ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, a)
    if (back) {
      g.addColorStop(0.5, b)
      g.addColorStop(1, a)
    } else g.addColorStop(1, b)
    v.grads.set(key, g)
  }
  return g
}

function drawRing(v: StageView, spot: CoverSpot, pad: number, col: BarColors): void {
  const { ctx: x, w: W, h: H, dpr } = v
  const { cx, cy, inner } = spot
  const maxLen = Math.min(cx, W - cx, cy, H - cy) - inner - pad
  if (maxLen < 4 * dpr) return
  const step = Math.PI / BANDS
  const bw = Math.max(1.2 * dpr, inner * step * 0.62)
  const capGap = Math.min(5 * dpr, pad)
  x.save()
  x.translate(cx, cy)
  x.lineCap = 'round'
  x.lineWidth = bw
  for (let i = 0; i < BANDS; i++) {
    const lv = levels[i]
    const len = Math.max(1.5 * dpr, lv * maxLen)
    // drawn from the ring's inner edge, so one gradient per length fits every band
    const whole = Math.round(len)
    const g = gradient(v, whole, 0, 0, 0, whole, col.c2, col.c1)
    const cap = Math.max(len, peaks[i] * maxLen) + capGap
    for (let k = 0; k < 2; k++) {
      x.save()
      x.rotate(ringAngle(i, k === 0 ? 1 : -1))
      x.translate(0, inner)
      x.strokeStyle = g
      x.globalAlpha = col.fade + lv * (1 - col.fade)
      x.beginPath()
      x.moveTo(0, 0)
      x.lineTo(0, len)
      x.stroke()
      if (pad > 4 * dpr) {
        x.strokeStyle = col.c1
        x.globalAlpha = 0.55 + peaks[i] * 0.45
        x.beginPath()
        x.moveTo(0, cap)
        x.lineTo(0, cap + 2.5 * dpr)
        x.stroke()
      }
      x.restore()
    }
  }
  x.restore()
  x.globalAlpha = 1
}

function drawSpectrum(v: StageView, compact: boolean, col: BarColors): void {
  const { ctx: x, w: W, h: H, dpr } = v
  const n = compact ? 28 : BANDS
  const m = (compact ? 2 : 14) * dpr
  const slot = (W - 2 * m) / n
  const bw = slot * 0.62
  const base = H - (compact ? 2 : 6) * dpr
  const maxH = compact ? H * 0.85 : H * 0.4
  const g = gradient(v, SPECTRUM_KEY, 0, base, 0, base - maxH, col.c2, col.c1)
  for (let j = 0; j < n; j++) {
    const i = compact ? j * 2 : j
    const lv = compact ? Math.max(levels[i], levels[i + 1]) : levels[i]
    const pk = compact ? Math.max(peaks[i], peaks[i + 1]) : peaks[i]
    const h = Math.max(2 * dpr, lv * maxH)
    const bx = m + j * slot + (slot - bw) / 2
    x.globalAlpha = col.fade + lv * (1 - col.fade)
    x.fillStyle = g
    x.fillRect(bx, base - h, bw, h)
    x.globalAlpha = 0.55 + pk * 0.45
    x.fillStyle = col.c1
    x.fillRect(
      bx,
      base - Math.max(h, pk * maxH) - (compact ? 3 : 5) * dpr,
      bw,
      (compact ? 1.5 : 2) * dpr
    )
  }
  x.globalAlpha = 1
}

// Too small for a ring: same bars, mirrored around the middle line
function drawMirror(v: StageView, col: BarColors): void {
  const { ctx: x, w: W, h: H, dpr } = v
  const n = 28
  const slot = W / n
  const mid = H / 2
  x.lineCap = 'round'
  x.lineWidth = slot * 0.55
  for (let j = 0; j < n; j++) {
    const i = (Math.abs(j - n / 2 + 0.5) * 2) | 0
    const lv = levels[Math.min(BANDS - 1, i * 2)]
    const h = Math.max(1.5 * dpr, lv * (mid - 2 * dpr))
    const whole = Math.round(h)
    x.strokeStyle = gradient(
      v,
      MIRROR_KEY + whole,
      0,
      mid - whole,
      0,
      mid + whole,
      col.c1,
      col.c2,
      true
    )
    x.globalAlpha = col.fade + lv * (1 - col.fade)
    x.beginPath()
    x.moveTo(slot * (j + 0.5), mid - h)
    x.lineTo(slot * (j + 0.5), mid + h)
    x.stroke()
  }
  x.globalAlpha = 1
}

// One pass of the wave line; `rev` draws it back to front, for the echo.
function waveLine(
  x: Ctx,
  W: number,
  cy: number,
  amp: number,
  sc: number,
  alpha: number,
  lw: number,
  rev: boolean
): void {
  x.beginPath()
  for (let k = 0; k < WAVE_N; k++) {
    const s = k / (WAVE_N - 1)
    const taper = Math.sin(s * Math.PI)
    const v = wave[rev ? WAVE_N - 1 - k : k]
    const px = s * W
    const py = cy + v * amp * sc * taper
    if (k) x.lineTo(px, py)
    else x.moveTo(px, py)
  }
  x.globalAlpha = alpha
  x.lineWidth = lw
  x.stroke()
}

function drawWave(v: StageView, cy: number, compact: boolean, col: BarColors): void {
  const { ctx: x, w: W, h: H, dpr } = v
  const amp = H * (compact ? 0.45 : 0.3)
  const g = gradient(v, WAVE_KEY, 0, 0, W, 0, col.c2, col.c1, true)
  x.save()
  x.strokeStyle = g
  x.lineJoin = 'round'
  x.lineCap = 'round'
  waveLine(x, W, cy, amp, 0.6, 0.35, 1.5 * dpr, true)
  // The glow is a wide faint stroke under the line. shadowBlur looks softer
  // but more than doubled the cost of the frame without a GPU.
  x.strokeStyle = col.c1
  waveLine(x, W, cy, amp, 1, 0.14, (compact ? 5 : 10) * dpr, false)
  x.strokeStyle = g
  waveLine(x, W, cy, amp, 1, 0.95, (compact ? 1.8 : 2.5) * dpr, false)
  x.restore()
  x.globalAlpha = 1
}

// Draws one stage. Called from the frame loop (loop.ts).
export function drawStage(v: StageView, style: VisualizerStyle, col: BarColors): void {
  v.ctx.clearRect(0, 0, v.w, v.h)
  if (style === 'off' || !v.w || !v.h) return
  const spot = v.cover
  if (style === 'ring') {
    if (spot) drawRing(v, spot, 8 * v.dpr, col)
    else drawMirror(v, col)
  } else if (style === 'spectrum') drawSpectrum(v, !spot, col)
  else drawWave(v, spot ? spot.cy : v.h / 2, !spot, col)
}
