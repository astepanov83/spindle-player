// Window sizes and positions, with no Electron calls so Vitest can check them.
import type { Template } from '../shared/layout'
import type { Size, StoredSettings } from '../shared/settings'

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
// A size larger than the work area is cut down, but never below the template minimum.
export function placeCentered(old: Rect, size: Size, area: Rect, template: Template): Rect {
  const width = Math.max(template.window.minWidth, Math.min(size.width, area.width))
  const height = Math.max(template.window.minHeight, Math.min(size.height, area.height))
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
  let best: Rect | undefined
  let bestOverlap = 0
  for (const area of areas) {
    const overlap = overlapArea(want, area)
    if (overlap > bestOverlap) {
      best = area
      bestOverlap = overlap
    }
  }
  return best && placeCentered(want, size, best, template)
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
