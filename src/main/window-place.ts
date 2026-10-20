// Window sizes and positions, with no Electron calls so Vitest can check them.
import type { Template } from '../shared/layout'
import type { Size, StoredSettings, WindowPlace } from '../shared/settings'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// The size the user last left this template at, or the template's own size the first time.
export function sizeFor(template: Template, saved: StoredSettings['windowSizes']): Size {
  const s = saved[template.id]
  return s
    ? { width: s.width, height: s.height }
    : { width: template.window.width, height: template.window.height }
}

// Keeps the old center, then pushes the window back onto the work area.
// A size larger than the work area is cut down, but never below the template
// minimum. A bar (Mini) is never taller than its most.
export function placeCentered(old: Rect, size: Size, area: Rect, template: Template): Rect {
  const { minWidth, minHeight, maxHeight = Infinity } = template.window
  const width = Math.max(minWidth, Math.min(size.width, area.width))
  const height = Math.max(minHeight, Math.min(size.height, area.height, maxHeight))
  const cx = old.x + old.width / 2
  const cy = old.y + old.height / 2
  let x = Math.round(cx - width / 2)
  let y = Math.round(cy - height / 2)
  // right and bottom first, so a window wider than the area keeps its top-left corner visible
  x = Math.max(area.x, Math.min(x, area.x + area.width - width))
  y = Math.max(area.y, Math.min(y, area.y + area.height - height))
  return { x, y, width, height }
}

// The saved place with this size, on the screen it overlaps most and pushed
// back onto it. None when it is on no screen now (one was unplugged), so the
// caller centers it on the main screen.
export function placeSaved(
  place: { x: number; y: number },
  size: Size,
  areas: Rect[],
  template: Template
): Rect | undefined {
  const want = { x: place.x, y: place.y, width: size.width, height: size.height }
  const best = mostOn(want, areas)
  return best && placeCentered(want, size, best, template)
}

// Where the window opens. A maximized one opens on the screen it was
// maximized on (`maxOn`), even when its normal place is on another: moving a
// maximized window to another screen leaves the normal place behind.
export function placeStart(
  place: WindowPlace | null,
  size: Size,
  areas: Rect[],
  primary: Rect,
  template: Template,
  maximized: boolean
): Rect {
  const saved = place ? placeSaved(place, size, areas, template) : undefined
  const normal = saved ?? placeCentered(primary, size, primary, template)
  const maxArea = maximized && place?.maxOn ? areaAt(place.maxOn, areas) : undefined
  return maxArea ? normalOn(normal, maxArea, areas, template) : normal
}

// The normal bounds kept on `area`: as they are when they are mostly on it,
// else centered on it at their size.
export function normalOn(normal: Rect, area: Rect, areas: Rect[], template: Template): Rect {
  return mostOn(normal, areas) === area ? normal : placeCentered(area, normal, area, template)
}

// What to save as the place. The corner is of the normal bounds, which main
// keeps itself: Electron's getNormalBounds() makes one up for a window
// maximized before it was shown. A maximized window also saves the center of
// its screen. None while minimized or full screen: the last place stays.
export function placeToSave(w: {
  maximized: boolean
  minimized: boolean
  fullScreen: boolean
  bounds: Rect
  normal: Rect
}): WindowPlace | undefined {
  if (w.minimized || w.fullScreen) return undefined
  if (!w.maximized) return { x: w.bounds.x, y: w.bounds.y }
  const b = w.bounds
  const maxOn = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
  return { x: w.normal.x, y: w.normal.y, maxOn }
}

// The work area a point is in.
export function areaAt(p: { x: number; y: number }, areas: Rect[]): Rect | undefined {
  return areas.find((a) => pointOver(p, a))
}

// The area a window overlaps most; none when it is on no screen.
export function mostOn(r: Rect, areas: Rect[]): Rect | undefined {
  let best: Rect | undefined
  let bestOverlap = 0
  for (const area of areas) {
    const overlap = overlapArea(r, area)
    if (overlap > bestOverlap) {
      best = area
      bestOverlap = overlap
    }
  }
  return best
}

function pointOver(p: { x: number; y: number }, r: Rect): boolean {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

// How long after Spindle sets a size the window manager's answer may come.
export const settleMs = 1000

// The size Spindle set last (at start or on a template switch). The window
// manager may round it or fit it to its own limits, and that shows up as a
// resize, not the user's choice. So a resize within settleMs of setting the
// size is taken as the size set; a later one that differs is the user's.
export class AppliedSize {
  #size: Size | undefined
  #until = -Infinity

  set(size: Size, now: number): void {
    this.#size = { width: size.width, height: size.height }
    this.#until = now + settleMs
  }

  // The window manager gets another chance to answer, when the window is first shown.
  settle(now: number): void {
    if (this.#size) this.#until = now + settleMs
  }

  // The size to save as the user's choice, when a resize ended at `at`; none
  // when it was the window manager's answer or nothing changed.
  userSize(size: Size, at: number): Size | undefined {
    if (this.#size && at <= this.#until) {
      this.#size = { width: size.width, height: size.height }
      return undefined
    }
    if (this.#size && this.#size.width === size.width && this.#size.height === size.height)
      return undefined
    this.#size = undefined
    return size
  }
}

// The parts of a BrowserWindow a template sets besides its size.
export interface KindWindow {
  setMinimumSize(width: number, height: number): void
  setMaximumSize(width: number, height: number): void
  setAlwaysOnTop(flag: boolean): void
}

// Wider than any screen: a most size of 0 wide would be no most size at all
// on Linux (X11 drops a maximum with a 0 side).
export const anyWidth = 16384

// What a template asks of the window: its minimum, a bar's most height (0 x 0
// is no limit), and staying above other windows while the user's pin is on.
// Leaving Mini clears both. Call before setting the size, or an old limit
// blocks it.
export function applyWindowKind(win: KindWindow, template: Template, miniOnTop: boolean): void {
  const w = template.window
  win.setMinimumSize(w.minWidth, w.minHeight)
  if (w.maxHeight) win.setMaximumSize(anyWidth, w.maxHeight)
  else win.setMaximumSize(0, 0)
  win.setAlwaysOnTop(!!w.onTop && miniOnTop)
}

// The pointer is over the window. Mini asks this, since its whole bar drags
// the window and a drag area gets no hover in the page.
export function pointerOver(p: { x: number; y: number }, r: Rect): boolean {
  return pointOver(p, r)
}
