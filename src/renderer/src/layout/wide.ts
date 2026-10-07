// A wide, short window draws the template's wide layout, if it has one: Focus
// puts the stage left and the words and controls right (ticket 079).
import type { Template } from '../../../shared/layout'

// Width and height of the page; 0 means not measured yet.
export function isWide(t: Template, width: number, height: number): boolean {
  if (!t.wide || !width || !height) return false
  return width >= t.wide.minWidth && width >= height * t.wide.ratio
}
