// What each key does, as plain functions; App.svelte runs the result.
// The full list is in docs/design.md (Keyboard).
import type { TemplateId } from '../../shared/layout'

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
  | 'mute'
  | 'previous'
  | 'next'
  | 'back'
  | 'forward'
  | 'search'
  | 'settings'
  | 'keys'
  | 'escape'
  | 'visualizer'
  | 'queue'
  // switch to that layout
  | TemplateId

export interface KeyPlace {
  // focus is in a text field
  typing: boolean
  // focus is on something that moves with the arrows (usesArrows)
  arrows: boolean
  menuOpen: boolean
}

// One key press that runs an action. Meta never counts; Ctrl and Alt must be
// as written. Shift may be held unless `shift` says.
export interface Chord {
  action: KeyAction
  // KeyboardEvent.key, or with `code`, KeyboardEvent.code: the key's place,
  // so it works on any keyboard layout
  key: string
  code?: boolean
  ctrl?: boolean
  alt?: boolean
  shift?: false
  // a held key goes on
  repeats?: boolean
  // works in a text field too
  inText?: boolean
  // a focused list or slider takes it first; Shift reaches past them
  yields?: boolean
}

// A line of the shortcut list in Settings (Keyboard): one or more chords that
// do one thing. keyAction reads the chords from here, so the list can't drift.
export interface Shortcut {
  does: string
  chords: Chord[]
}

const arrow = (key: string, action: KeyAction, more: Partial<Chord> = {}): Chord => ({
  action,
  key,
  repeats: true,
  ...more
})

export const shortcuts: Shortcut[] = [
  { does: 'Play or pause', chords: [{ action: 'toggle', key: 'Space', code: true }] },
  {
    does: 'Seek 5 s back or forward',
    chords: [
      arrow('ArrowLeft', 'seekBack', { yields: true }),
      arrow('ArrowRight', 'seekForward', { yields: true })
    ]
  },
  {
    does: 'Volume up or down 5%',
    chords: [
      arrow('ArrowUp', 'volumeUp', { yields: true }),
      arrow('ArrowDown', 'volumeDown', { yields: true })
    ]
  },
  { does: 'Mute or unmute', chords: [{ action: 'mute', key: 'm' }] },
  {
    does: 'Previous or next song',
    chords: [
      arrow('ArrowLeft', 'previous', { ctrl: true }),
      arrow('ArrowRight', 'next', { ctrl: true })
    ]
  },
  {
    does: 'Find: go to the search box',
    chords: [
      { action: 'search', key: 'KeyF', code: true, ctrl: true, inText: true },
      { action: 'search', key: '/' }
    ]
  },
  {
    // a held Alt+Left must not go back page after page
    does: 'Back or forward through the library',
    chords: [
      { action: 'back', key: 'ArrowLeft', alt: true },
      { action: 'forward', key: 'ArrowRight', alt: true },
      { action: 'back', key: 'Backspace', shift: false }
    ]
  },
  {
    does: 'Open or close Settings',
    chords: [{ action: 'settings', key: 'Comma', code: true, ctrl: true, inText: true }]
  },
  { does: 'This list of keys', chords: [{ action: 'keys', key: '?' }] },
  {
    does: 'Close the menu, then Settings, then the queue drawer',
    chords: [{ action: 'escape', key: 'Escape', repeats: true }]
  },
  { does: 'Next visualizer style', chords: [{ action: 'visualizer', key: 'v' }] },
  {
    does: 'Queue: switch to its tab, or open or close the drawer',
    chords: [{ action: 'queue', key: 'q' }]
  },
  {
    does: 'Switch layout: Studio, Classic or Focus',
    chords: [
      { action: 'studio', key: 'Digit1', code: true, ctrl: true, inText: true },
      { action: 'classic', key: 'Digit2', code: true, ctrl: true, inText: true },
      { action: 'focus', key: 'Digit3', code: true, ctrl: true, inText: true }
    ]
  }
]

const chords = shortcuts.flatMap((s) => s.chords)

// The chord that switches to a layout, for its button's tooltip.
export function layoutChord(id: TemplateId): string {
  const c = chords.find((c) => c.action === id)
  return c ? chordText(c) : ''
}

const matches = (e: FullKey, c: Chord): boolean =>
  (c.code ? e.code === c.key : e.key === c.key) &&
  e.ctrlKey === !!c.ctrl &&
  e.altKey === !!c.alt &&
  !e.metaKey &&
  (c.shift === undefined || e.shiftKey === c.shift)

const notTyping: Target = { tagName: 'DIV', isContentEditable: false }

export function keyAction(e: FullKey, place: KeyPlace): KeyAction {
  if (place.menuOpen) return e.key === 'Escape' ? 'escape' : 'none'
  // Space with a modifier or held never presses the focused button
  if (!place.typing && spaceAction(e, notTyping, false) === 'block') return 'block'
  const c = chords.find((c) => matches(e, c))
  if (!c) return 'none'
  // a text field keeps the rest, Escape too (the search box has its own)
  if (place.typing && !c.inText) return 'none'
  if (e.repeat && !c.repeats) return 'none'
  if (c.yields && place.arrows && !e.shiftKey) return 'none'
  return c.action
}

const keyNames: Record<string, string> = {
  Space: 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Comma: ',',
  PageUp: 'Page Up',
  PageDown: 'Page Down'
}

// How a chord is written in the list: "Ctrl+←", "Ctrl+F", "V".
export function chordText(c: Pick<Chord, 'key' | 'ctrl' | 'alt'>): string {
  const name = keyNames[c.key] ?? c.key.replace(/^(Key(?=[A-Z]$)|Digit(?=\d$))/, '')
  const key = name.length === 1 ? name.toUpperCase() : name
  return `${c.ctrl ? 'Ctrl+' : ''}${c.alt ? 'Alt+' : ''}${key}`
}

// The keys of a line, one entry per way to press it: ["Ctrl+F", "/"],
// ["← / →"]. Chords next to each other that do different things with the
// same Ctrl and Alt share an entry ("Ctrl+1 / Ctrl+2 / Ctrl+3").
export function shortcutKeys(s: Pick<Shortcut, 'chords'>): string[] {
  const out: string[] = []
  const cs = s.chords
  let i = 0
  while (i < cs.length) {
    const run = [cs[i++]]
    const joins = (c: Chord): boolean =>
      sameMods(c, run[0]) && run.every((r) => r.action !== c.action)
    while (i < cs.length && joins(cs[i])) run.push(cs[i++])
    out.push(run.map(chordText).join(' / '))
  }
  return out
}

const sameMods = (a: Chord, b: Chord): boolean => !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt

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

// The keys inside a list (song table, queue, album page, search songs,
// radio lists), for the list in Settings. listStep, ui/roving.ts (Enter),
// the radio rows and the queue rows run them; a test checks listStep's.
export const listShortcuts: { keys: string[]; does: string }[] = [
  { keys: ['ArrowUp', 'ArrowDown'], does: 'Previous or next row' },
  { keys: ['PageUp', 'PageDown'], does: 'A screen of rows up or down' },
  { keys: ['Home', 'End'], does: 'First or last row' },
  { keys: ['Enter'], does: 'Play the row' },
  { keys: ['ArrowRight', 'ArrowLeft'], does: 'On a station: to its star and back' },
  { keys: ['Alt+ArrowUp', 'Alt+ArrowDown'], does: 'On a queue row: move the song' },
  { keys: ['Delete'], does: 'On a queue or playlist row: remove it' }
]

// "Alt+ArrowUp" as "Alt+↑"
export const keyText = (k: string): string => {
  const alt = k.startsWith('Alt+')
  return chordText({ key: alt ? k.slice(4) : k, alt })
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
