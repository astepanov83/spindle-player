// What each key does, as plain functions; App.svelte runs the result.
// The full list is in docs/design.md (Keyboard).
type Target = Pick<HTMLElement, 'tagName' | 'isContentEditable'> & { type?: string }
type Key = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat'>
type FullKey = Key & Pick<KeyboardEvent, 'key' | 'shiftKey'>

const textInputs = ['text', 'search', 'number', 'email', 'url', 'password', 'tel', '']

// A slider or checkbox is not a text field: Space there still plays.
export function isTyping(t: Target): boolean {
  if (t.isContentEditable || t.tagName === 'TEXTAREA') return true
  return t.tagName === 'INPUT' && textInputs.includes((t.type ?? '').toLowerCase())
}

// Rows that move the focus with the arrows sit in a [data-rows] list (ui/roving.ts).
export const listSelector = '[data-rows]'

// The focused control takes the arrows itself, so they don't seek or set the volume.
export function usesArrows(t: Target & { closest(s: string): Element | null }): boolean {
  if (t.tagName === 'SELECT') return true
  const type = (t.type ?? '').toLowerCase()
  if (t.tagName === 'INPUT' && (type === 'range' || type === 'radio')) return true
  return !!t.closest(listSelector)
}

// Space plays and pauses from anywhere except a text field, so a button that
// kept focus after a click is never pressed by it.
// 'block' stops the browser from pressing the focused button, 'toggle' also plays or pauses.
// A held key repeats, so only the first press toggles. An open menu keeps its own keys.
export function spaceAction(e: Key, t: Target, menuOpen: boolean): 'none' | 'block' | 'toggle' {
  if (e.code !== 'Space' || menuOpen || isTyping(t)) return 'none'
  if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return 'block'
  return 'toggle'
}

export type KeyAction =
  | 'none'
  | 'block'
  | 'toggle'
  | 'seekBack'
  | 'seekForward'
  | 'volumeUp'
  | 'volumeDown'
  | 'previous'
  | 'next'
  | 'back'
  | 'forward'
  | 'search'
  | 'settings'
  | 'escape'
  | 'visualizer'
  | 'queue'

export interface KeyPlace {
  // focus is in a text field
  typing: boolean
  // focus is on something that moves with the arrows (usesArrows)
  arrows: boolean
  menuOpen: boolean
}

const arrowActions: Record<string, KeyAction> = {
  ArrowLeft: 'seekBack',
  ArrowRight: 'seekForward',
  ArrowUp: 'volumeUp',
  ArrowDown: 'volumeDown'
}

const notTyping: Target = { tagName: 'DIV', isContentEditable: false }

// Ctrl+F and Ctrl+, go by the key's place (code), so they work on any layout.
export function keyAction(e: FullKey, place: KeyPlace): KeyAction {
  if (place.menuOpen) return e.key === 'Escape' ? 'escape' : 'none'
  const ctrlOnly = e.ctrlKey && !e.altKey && !e.metaKey
  if (ctrlOnly && !e.repeat && e.code === 'KeyF') return 'search'
  if (ctrlOnly && !e.repeat && e.code === 'Comma') return 'settings'
  // a text field keeps the rest, Escape too (the search box has its own)
  if (place.typing) return 'none'
  if (e.code === 'Space') return spaceAction(e, notTyping, false)
  if (e.key === 'Escape') return 'escape'
  if (e.metaKey) return 'none'
  const arrow = arrowActions[e.key]
  if (arrow && ctrlOnly) {
    if (e.key === 'ArrowLeft') return 'previous'
    if (e.key === 'ArrowRight') return 'next'
    return 'none'
  }
  // a held Alt+Left must not go back page after page
  if (arrow && e.altKey && !e.ctrlKey && !e.repeat) {
    if (e.key === 'ArrowLeft') return 'back'
    if (e.key === 'ArrowRight') return 'forward'
    return 'none'
  }
  if (e.ctrlKey || e.altKey) return 'none'
  // a held arrow keeps seeking; Shift reaches past a list or slider
  if (arrow) return place.arrows && !e.shiftKey ? 'none' : arrow
  if (e.repeat) return 'none'
  if (e.key === 'Backspace' && !e.shiftKey) return 'back'
  if (e.key === '/') return 'search'
  if (e.key === 'v') return 'visualizer'
  if (e.key === 'q') return 'queue'
  return 'none'
}

// Escape closes one thing at a time, the one on top first.
export function escapeTarget(open: {
  menu: boolean
  settings: boolean
  drawer: boolean
}): 'menu' | 'settings' | 'drawer' | 'none' {
  if (open.menu) return 'menu'
  if (open.settings) return 'settings'
  if (open.drawer) return 'drawer'
  return 'none'
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

export const volumeStep = (volume: number, dir: 1 | -1): number => clamp(volume + dir * 5, 0, 100)

export const seekStep = (pos: number, duration: number, dir: 1 | -1): number =>
  clamp(pos + dir * 5, 0, duration)

// The seek bar's keys, as a slider: the new value, or null for a key it leaves alone.
export function sliderKey(
  key: string,
  value: number,
  max: number,
  step: number,
  page: number
): number | null {
  const by: Record<string, number> = {
    ArrowRight: step,
    ArrowUp: step,
    ArrowLeft: -step,
    ArrowDown: -step,
    PageUp: page,
    PageDown: -page
  }
  if (key === 'Home') return 0
  if (key === 'End') return max
  if (!(key in by)) return null
  return clamp(value + by[key], 0, max)
}

// The row a key moves to in a list of `count` rows, from row `i` (-1: none
// had focus). `page` is the rows on screen. null: the key is not the list's.
export function listStep(key: string, i: number, count: number, page: number): number | null {
  if (!count) return null
  const by: Record<string, number> = {
    ArrowDown: 1,
    ArrowUp: -1,
    PageDown: page,
    PageUp: -page
  }
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (!(key in by)) return null
  if (i < 0) return 0
  return clamp(i + by[key], 0, count - 1)
}

// Delete on a queue or playlist row takes it out. Not Backspace: that is
// Back. A held key takes out one row only.
export function isRemoveKey(e: FullKey): boolean {
  return e.key === 'Delete' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
}

// The row to focus after row `i` left a list that now has `count` rows: the
// one that took its place, else the new last one. null when none are left.
export function rowAfterRemove(i: number, count: number): number | null {
  return count ? Math.min(i, count - 1) : null
}

// A group of choices (Settings' segmented buttons): arrows go round.
export function radioStep(key: string, i: number, count: number): number | null {
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const by: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
  if (!(key in by)) return null
  return (i + by[key] + count) % count
}

// A row of tabs (Now playing / Queue): Left and Right go round. Up and Down
// are left to the volume, since the tabs lie in a row.
export function tabStep(key: string, i: number, count: number): number | null {
  if (key === 'ArrowUp' || key === 'ArrowDown') return null
  return radioStep(key, i, count)
}
