import { describe, expect, it } from 'vitest'
import { templates } from '../shared/templates'
import { placeCentered, sizeFor } from './window-place'

const area = { x: 0, y: 0, width: 1920, height: 1080 }

describe('sizeFor', () => {
  it('uses the template size the first time', () => {
    expect(sizeFor(templates.focus, {})).toEqual({ width: 440, height: 680 })
  })
  it('uses the saved size after that', () => {
    const saved = { focus: { width: 520, height: 900 } }
    expect(sizeFor(templates.focus, saved)).toEqual({ width: 520, height: 900 })
    expect(sizeFor(templates.studio, saved)).toEqual({ width: 1100, height: 680 })
  })
})

describe('placeCentered', () => {
  it('keeps the center when the window shrinks and grows back', () => {
    const studio = { x: 410, y: 200, width: 1100, height: 680 }
    const focus = placeCentered(studio, { width: 440, height: 680 }, area, templates.focus)
    expect(focus).toEqual({ x: 740, y: 200, width: 440, height: 680 })
    expect(placeCentered(focus, { width: 1100, height: 680 }, area, templates.studio)).toEqual(
      studio
    )
  })

  it('pushes a window that would stick out back onto the work area', () => {
    const nearLeft = { x: 0, y: 30, width: 440, height: 680 }
    expect(placeCentered(nearLeft, { width: 1100, height: 680 }, area, templates.studio)).toEqual({
      x: 0,
      y: 30,
      width: 1100,
      height: 680
    })
    const nearRight = { x: 1480, y: 500, width: 440, height: 680 }
    expect(placeCentered(nearRight, { width: 1100, height: 680 }, area, templates.studio)).toEqual({
      x: 820,
      y: 400,
      width: 1100,
      height: 680
    })
  })

  it('works on a second screen with its own offset', () => {
    const right = { x: 1920, y: 0, width: 1280, height: 1000 }
    const old = { x: 1930, y: 10, width: 440, height: 680 }
    expect(placeCentered(old, { width: 1100, height: 680 }, right, templates.studio)).toEqual({
      x: 1920,
      y: 10,
      width: 1100,
      height: 680
    })
  })

  it('cuts a saved size down to a small screen, but not below the minimum', () => {
    const small = { x: 0, y: 0, width: 1024, height: 600 }
    const old = { x: 100, y: 0, width: 440, height: 600 }
    expect(placeCentered(old, { width: 1600, height: 1000 }, small, templates.studio)).toEqual({
      x: 0,
      y: 0,
      width: 1024,
      height: 600
    })
    const tiny = { x: 0, y: 0, width: 800, height: 500 }
    const r = placeCentered(old, { width: 1100, height: 680 }, tiny, templates.studio)
    expect([r.width, r.height]).toEqual([860, 560])
    expect([r.x, r.y]).toEqual([0, 0])
  })
})
