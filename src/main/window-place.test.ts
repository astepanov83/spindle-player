import { describe, expect, it } from 'vitest'
import { templates } from '../shared/templates'
import {
  AppliedSize,
  applyWindowKind,
  normalOn,
  placeCentered,
  placeSaved,
  placeStart,
  placeToSave,
  pointerOver,
  settleMs,
  sizeFor,
  type KindWindow
} from './window-place'

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

describe('AppliedSize', () => {
  const set = { width: 1000, height: 700 }

  it('takes the window manager rounding the size it was given as that size', () => {
    const a = new AppliedSize()
    a.set(set, 0)
    expect(a.userSize({ width: 1001, height: 700 }, 50)).toBeUndefined()
    // and the rounded size is not a change later either, e.g. on close
    expect(a.userSize({ width: 1001, height: 700 }, 5000)).toBeUndefined()
  })

  it('saves a size the user picks later', () => {
    const a = new AppliedSize()
    a.set(set, 0)
    expect(a.userSize({ width: 1200, height: 700 }, settleMs + 1)).toEqual({
      width: 1200,
      height: 700
    })
    // from then on every change is the user's
    expect(a.userSize({ width: 1200, height: 700 }, settleMs + 2)).toEqual({
      width: 1200,
      height: 700
    })
  })

  it('saves nothing when the size stayed as set', () => {
    const a = new AppliedSize()
    a.set(set, 0)
    expect(a.userSize(set, 5000)).toBeUndefined()
  })

  it('gives the window manager another chance when the window is shown', () => {
    const a = new AppliedSize()
    a.set(set, 0)
    a.settle(3000)
    expect(a.userSize({ width: 980, height: 700 }, 3100)).toBeUndefined()
  })

  it('does nothing on show when no size was set', () => {
    const a = new AppliedSize()
    a.settle(0)
    expect(a.userSize(set, 10)).toEqual(set)
  })
})

describe('placeSaved', () => {
  const size = { width: 1100, height: 680 }
  const left = { x: -1920, y: 0, width: 1920, height: 1040 }

  it('opens where it was', () => {
    expect(placeSaved({ x: 300, y: 120 }, size, [area], templates.studio)).toEqual({
      x: 300,
      y: 120,
      ...size
    })
  })

  it('keeps it on the second screen it was on', () => {
    expect(placeSaved({ x: -1500, y: 100 }, size, [area, left], templates.studio)).toEqual({
      x: -1500,
      y: 100,
      ...size
    })
  })

  it('pushes a window half off the edge back onto its screen', () => {
    expect(placeSaved({ x: 1500, y: 900 }, size, [area], templates.studio)).toEqual({
      x: 820,
      y: 400,
      ...size
    })
  })

  it('gives none when its screen is gone', () => {
    expect(placeSaved({ x: -1500, y: 100 }, size, [area], templates.studio)).toBeUndefined()
  })
})

describe('Mini (ticket 110)', () => {
  it('opens as a bar the first time, then at its saved size', () => {
    expect(sizeFor(templates.mini, {})).toEqual({ width: 360, height: 72 })
    expect(sizeFor(templates.mini, { mini: { width: 500, height: 80 } })).toEqual({
      width: 500,
      height: 80
    })
  })

  it('keeps the center of the big window and stays a bar', () => {
    const studio = { x: 410, y: 200, width: 1100, height: 680 }
    const mini = placeCentered(studio, { width: 360, height: 72 }, area, templates.mini)
    expect(mini).toEqual({ x: 780, y: 504, width: 360, height: 72 })
    // a size too tall (a hand-edited file) is cut to the bar's most
    expect(placeCentered(studio, { width: 360, height: 400 }, area, templates.mini).height).toBe(96)
    // and back to Studio around the bar's center
    expect(placeCentered(mini, { width: 1100, height: 680 }, area, templates.studio)).toEqual(
      studio
    )
  })

  function fakeWindow(): KindWindow & { calls: string[]; onTop: boolean } {
    const w = {
      calls: [] as string[],
      onTop: false,
      setMinimumSize: (a: number, b: number) => w.calls.push(`min ${a}x${b}`),
      setMaximumSize: (a: number, b: number) => w.calls.push(`max ${a}x${b}`),
      setAlwaysOnTop: (on: boolean) => {
        w.onTop = on
        w.calls.push(`top ${on}`)
      }
    }
    return w
  }

  it('puts Mini on top and takes it off when leaving', () => {
    const win = fakeWindow()
    applyWindowKind(win, templates.mini, true)
    expect(win.calls).toEqual(['min 280x64', 'max 16384x96', 'top true'])
    win.calls = []
    applyWindowKind(win, templates.studio, true)
    expect(win.calls).toEqual(['min 860x560', 'max 0x0', 'top false'])
  })

  it('keeps Mini under other windows while the pin is off', () => {
    const win = fakeWindow()
    applyWindowKind(win, templates.mini, false)
    expect(win.onTop).toBe(false)
    applyWindowKind(win, templates.mini, true)
    expect(win.onTop).toBe(true)
    // the pin is Mini's: the big layouts never stay on top
    for (const id of ['studio', 'classic', 'focus'] as const) {
      applyWindowKind(win, templates[id], true)
      expect(win.onTop).toBe(false)
    }
  })
})

describe('pointerOver', () => {
  const bar = { x: 100, y: 50, width: 360, height: 72 }
  it('is on the bar from its top-left corner up to, not on, its far edges', () => {
    expect(pointerOver({ x: 100, y: 50 }, bar)).toBe(true)
    expect(pointerOver({ x: 459, y: 121 }, bar)).toBe(true)
    expect(pointerOver({ x: 460, y: 80 }, bar)).toBe(false)
    expect(pointerOver({ x: 200, y: 122 }, bar)).toBe(false)
    expect(pointerOver({ x: 99, y: 80 }, bar)).toBe(false)
    expect(pointerOver({ x: 200, y: 49 }, bar)).toBe(false)
  })
})

// Two screens side by side, like the user's: left is the main one.
describe('maximized on another screen', () => {
  const left = { x: 0, y: 0, width: 3840, height: 2120 }
  const right = { x: 3840, y: 0, width: 3840, height: 2120 }
  const areas = [left, right]
  const size = { width: 1100, height: 680 }
  const onRight = { x: 5760, y: 1060 }

  it('opens where it was when not maximized, even with an old maxOn', () => {
    const place = { x: 1552, y: 10, maxOn: onRight }
    expect(placeStart(place, size, areas, left, templates.studio, false)).toEqual({
      x: 1552,
      y: 10,
      ...size
    })
  })

  it('opens on the screen it was maximized on', () => {
    const place = { x: 1552, y: 10, maxOn: onRight }
    const b = placeStart(place, size, areas, left, templates.studio, true)
    expect(b).toEqual({ x: 3840 + (3840 - 1100) / 2, y: (2120 - 680) / 2, ...size })
  })

  it('keeps the normal place when it is on that screen already', () => {
    const place = { x: 4000, y: 100, maxOn: onRight }
    expect(placeStart(place, size, areas, left, templates.studio, true)).toEqual({
      x: 4000,
      y: 100,
      ...size
    })
  })

  it('opens at the normal place when the maximized screen is gone', () => {
    const place = { x: 1552, y: 10, maxOn: onRight }
    expect(placeStart(place, size, [left], left, templates.studio, true)).toEqual({
      x: 1552,
      y: 10,
      ...size
    })
  })

  it('centers on the main screen the first time', () => {
    const b = placeStart(null, size, areas, left, templates.studio, true)
    expect(b).toEqual({ x: (3840 - 1100) / 2, y: (2120 - 680) / 2, ...size })
  })

  it('moves normal bounds onto a screen only when they are not on it', () => {
    const n = { x: 100, y: 100, ...size }
    expect(normalOn(n, left, areas, templates.studio)).toBe(n)
    expect(normalOn(n, right, areas, templates.studio).x).toBe(3840 + (3840 - 1100) / 2)
  })
})

describe('placeToSave', () => {
  const normal = { x: 300, y: 120, width: 1100, height: 680 }
  const full = { x: 3840, y: 0, width: 3840, height: 2120 }
  const w = { maximized: false, minimized: false, fullScreen: false, bounds: normal, normal }

  it('saves the corner of a normal window', () => {
    expect(placeToSave({ ...w, bounds: { ...normal, x: 310 } })).toEqual({ x: 310, y: 120 })
  })

  it('saves the kept normal corner and the screen of a maximized one', () => {
    // never the window's own made-up normal bounds (ticket: maximized before shown)
    expect(placeToSave({ ...w, maximized: true, bounds: full })).toEqual({
      x: 300,
      y: 120,
      maxOn: { x: 5760, y: 1060 }
    })
  })

  it('saves nothing while minimized or full screen', () => {
    expect(placeToSave({ ...w, minimized: true })).toBeUndefined()
    expect(placeToSave({ ...w, maximized: true, minimized: true, bounds: full })).toBeUndefined()
    expect(placeToSave({ ...w, fullScreen: true })).toBeUndefined()
  })
})
