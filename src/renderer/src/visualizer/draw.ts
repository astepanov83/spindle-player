// One draw function per style, over the same levels. Ported from the prototype.
// A stage with no cover (the small one in the bar) gets a compact version.
import type { VisualizerStyle } from '../../../shared/settings'
import type { BarColors } from './colors'
import { ringAngle } from './analysis'
import { BANDS, WAVE_N, levels, peaks, wave } from './levels'

type Ctx = CanvasRenderingContext2D

function drawRing(
  x: Ctx,
  W: number,
  H: number,
  cx: number,
  cy: number,
  inner: number,
  pad: number,
  dpr: number,
  col: BarColors
): void {
  const maxLen = Math.min(cx, W - cx, cy, H - cy) - inner - pad
  if (maxLen < 4 * dpr) return
  const step = Math.PI / BANDS
  const bw = Math.max(1.2 * dpr, inner * step * 0.62)
  x.save()
  x.translate(cx, cy)
  x.lineCap = 'round'
  x.lineWidth = bw
  for (let i = 0; i < BANDS; i++) {
    const v = levels[i]
    const len = Math.max(1.5 * dpr, v * maxLen)
    const g = x.createLinearGradient(0, inner, 0, inner + len)
    g.addColorStop(0, col.c2)
    g.addColorStop(1, col.c1)
    const cap = inner + Math.max(len, peaks[i] * maxLen) + Math.min(5 * dpr, pad)
    for (const side of [1, -1] as const) {
      x.save()
      x.rotate(ringAngle(i, side))
      x.strokeStyle = g
      x.globalAlpha = col.fade + v * (1 - col.fade)
      x.beginPath()
      x.moveTo(0, inner)
      x.lineTo(0, inner + len)
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

function drawSpectrum(
  x: Ctx,
  W: number,
  H: number,
  compact: boolean,
  dpr: number,
  col: BarColors
): void {
  const n = compact ? 28 : BANDS
  const m = (compact ? 2 : 14) * dpr
  const slot = (W - 2 * m) / n
  const bw = slot * 0.62
  const base = H - (compact ? 2 : 6) * dpr
  const maxH = compact ? H * 0.85 : H * 0.4
  const g = x.createLinearGradient(0, base, 0, base - maxH)
  g.addColorStop(0, col.c2)
  g.addColorStop(1, col.c1)
  for (let j = 0; j < n; j++) {
    const i = compact ? j * 2 : j
    const v = compact ? Math.max(levels[i], levels[i + 1]) : levels[i]
    const pk = compact ? Math.max(peaks[i], peaks[i + 1]) : peaks[i]
    const h = Math.max(2 * dpr, v * maxH)
    const bx = m + j * slot + (slot - bw) / 2
    x.globalAlpha = col.fade + v * (1 - col.fade)
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
function drawMirror(x: Ctx, W: number, H: number, dpr: number, col: BarColors): void {
  const n = 28
  const slot = W / n
  const mid = H / 2
  x.lineCap = 'round'
  x.lineWidth = slot * 0.55
  for (let j = 0; j < n; j++) {
    const i = (Math.abs(j - n / 2 + 0.5) * 2) | 0
    const v = levels[Math.min(BANDS - 1, i * 2)]
    const h = Math.max(1.5 * dpr, v * (mid - 2 * dpr))
    const g = x.createLinearGradient(0, mid - h, 0, mid + h)
    g.addColorStop(0, col.c1)
    g.addColorStop(0.5, col.c2)
    g.addColorStop(1, col.c1)
    x.strokeStyle = g
    x.globalAlpha = col.fade + v * (1 - col.fade)
    x.beginPath()
    x.moveTo(slot * (j + 0.5), mid - h)
    x.lineTo(slot * (j + 0.5), mid + h)
    x.stroke()
  }
  x.globalAlpha = 1
}

function drawWave(
  x: Ctx,
  W: number,
  H: number,
  cy: number,
  compact: boolean,
  dpr: number,
  col: BarColors
): void {
  const amp = H * (compact ? 0.45 : 0.3)
  const g = x.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0, col.c2)
  g.addColorStop(0.5, col.c1)
  g.addColorStop(1, col.c2)
  const line = (sc: number, alpha: number, lw: number, rev: boolean): void => {
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
  x.save()
  x.strokeStyle = g
  x.lineJoin = 'round'
  x.lineCap = 'round'
  line(0.6, 0.35, 1.5 * dpr, true)
  // The glow is a wide faint stroke under the line. shadowBlur looks softer
  // but more than doubled the cost of the frame without a GPU.
  x.strokeStyle = col.c1
  line(1, 0.14, (compact ? 5 : 10) * dpr, false)
  x.strokeStyle = g
  line(1, 0.95, (compact ? 1.8 : 2.5) * dpr, false)
  x.restore()
  x.globalAlpha = 1
}

// Draws one stage: a `.vstage` element with a canvas and maybe a `.cover`.
// Called from the frame loop (loop.ts).
export function drawStage(stage: HTMLElement, style: VisualizerStyle, col: BarColors): void {
  const cv = stage.querySelector('canvas')
  if (!cv) return
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(stage.clientWidth * dpr)
  const h = Math.round(stage.clientHeight * dpr)
  if (cv.width !== w || cv.height !== h) {
    cv.width = w
    cv.height = h
  }
  const x = cv.getContext('2d')!
  x.clearRect(0, 0, w, h)
  if (style === 'off') return
  const cover = stage.querySelector<HTMLElement>('.cover')
  const compact = !cover
  let cx = w / 2
  let cy = h / 2
  let inner = Math.min(w, h) * 0.16
  if (cover) {
    const cr = cover.getBoundingClientRect()
    const sr = stage.getBoundingClientRect()
    cx = (cr.left + cr.width / 2 - sr.left) * dpr
    cy = (cr.top + cr.height / 2 - sr.top) * dpr
    inner = (cr.width / 2 + 10) * dpr
  }
  if (style === 'ring' && compact) drawMirror(x, w, h, dpr, col)
  else if (style === 'ring') drawRing(x, w, h, cx, cy, inner, 8 * dpr, dpr, col)
  else if (style === 'spectrum') drawSpectrum(x, w, h, compact, dpr, col)
  else drawWave(x, w, h, cy, compact, dpr, col)
}
