// The draw functions keep their gradients, so a frame makes no new ones once
// warmed up. A fake 2D context counts what they ask for.
import { describe, expect, it } from 'vitest'
import { drawStage, type StageView } from './draw'
import { BANDS, levels, peaks, wave } from './levels'
import type { VisualizerStyle } from '../../../shared/settings'

function view(cover: boolean): StageView & { made: () => number; strokes: () => number } {
  let made = 0
  let strokes = 0
  const noop = (): void => {}
  const ctx = {
    createLinearGradient: () => {
      made++
      return { addColorStop: noop }
    },
    clearRect: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: () => strokes++,
    fillRect: noop
  }
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    w: 400,
    h: 300,
    dpr: 1,
    cover: cover ? { cx: 200, cy: 150, inner: 60 } : null,
    grads: new Map(),
    made: () => made,
    strokes: () => strokes
  }
}

const colors = { c1: '#ff0000', c2: '#00ff00', fade: 0.4 }
const styles: VisualizerStyle[] = ['ring', 'spectrum', 'wave']

describe('drawStage', () => {
  for (const style of styles)
    for (const cover of [true, false])
      it(`${style}${cover ? '' : ' (small stage)'}: no new gradients for the same levels`, () => {
        for (let i = 0; i < levels.length; i++) levels[i] = peaks[i] = (i % 7) / 7
        wave.fill(0.3)
        const v = view(cover)
        drawStage(v, style, colors)
        const first = v.made()
        expect(first).toBeGreaterThan(0)
        drawStage(v, style, colors)
        drawStage(v, style, colors)
        expect(v.made()).toBe(first)
      })

  it('the ring keeps one gradient per whole pixel of bar length', () => {
    levels.fill(0.5)
    const v = view(true)
    drawStage(v, 'ring', colors)
    expect(v.made()).toBe(1)
    // a hair longer is the same pixel
    levels.fill(0.501)
    drawStage(v, 'ring', colors)
    expect(v.made()).toBe(1)
  })

  it('the ring draws a peak cap past each bar, unless caps are off', () => {
    levels.fill(0.5)
    const v = view(true)
    drawStage(v, 'ring', colors)
    // bar and cap, on both sides
    expect(v.strokes()).toBe(BANDS * 4)
    const bare = view(true)
    drawStage(bare, 'ring', colors, false)
    expect(bare.strokes()).toBe(BANDS * 2)
  })

  it('draws nothing with the style Off or no size', () => {
    const v = view(true)
    drawStage(v, 'off', colors)
    drawStage({ ...v, w: 0 }, 'ring', colors)
    expect(v.made()).toBe(0)
  })
})
