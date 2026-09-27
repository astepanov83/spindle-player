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
