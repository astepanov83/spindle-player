import { describe, expect, it } from 'vitest'
import {
  escapeTarget,
  isTyping,
  keyAction,
  layoutChord,
  type Chord,
  type KeyAction,
  isRemoveKey,
  keyText,
  listShortcuts,
  listStep,
  rowAfterRemove,
  radioStep,
  seekStep,
  shortcutKeys,
  shortcuts,
  sliderKey,
  spaceAction,
  tabStep,
  usesArrows,
  volumeStep
} from './keys'

const key = (over: Record<string, unknown> = {}): Parameters<typeof spaceAction>[0] => ({
  code: 'Space',
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  ...over
})
const el = (
  tagName: string,
  type?: string,
  isContentEditable = false
): Parameters<typeof spaceAction>[1] => ({
  tagName,
  type,
  isContentEditable
})

describe('isTyping', () => {
  it('is true in a text field', () => {
    for (const type of ['text', 'search', 'number', 'email', 'url', 'password', undefined, '']) {
      expect(isTyping(el('INPUT', type))).toBe(true)
    }
    expect(isTyping(el('TEXTAREA'))).toBe(true)
    expect(isTyping(el('DIV', undefined, true))).toBe(true)
  })
  it('is false on a slider, checkbox, radio or button', () => {
    for (const type of ['range', 'checkbox', 'radio', 'button']) {
      expect(isTyping(el('INPUT', type))).toBe(false)
    }
    expect(isTyping(el('BUTTON'))).toBe(false)
  })
})

describe('spaceAction', () => {
  it('toggles on Space, on a button and on a slider', () => {
    expect(spaceAction(key(), el('BUTTON'), false)).toBe('toggle')
    expect(spaceAction(key(), el('INPUT', 'range'), false)).toBe('toggle')
    expect(spaceAction(key(), el('INPUT', 'checkbox'), false)).toBe('toggle')
  })
  it('ignores other keys', () =>
    expect(spaceAction(key({ code: 'Enter' }), el('BUTTON'), false)).toBe('none'))
  it('leaves a text field alone', () =>
    expect(spaceAction(key(), el('INPUT', 'text'), false)).toBe('none'))
  it('leaves an open menu alone', () => expect(spaceAction(key(), el('BUTTON'), true)).toBe('none'))
  it('only blocks with Ctrl, Alt or Meta', () => {
    for (const m of ['ctrlKey', 'altKey', 'metaKey']) {
      expect(spaceAction(key({ [m]: true }), el('BUTTON'), false)).toBe('block')
    }
  })
  it('only blocks a repeat from a held key', () => {
    expect(spaceAction(key({ repeat: true }), el('BUTTON'), false)).toBe('block')
  })
})

const press = (k: string, over: Record<string, unknown> = {}): Parameters<typeof keyAction>[0] => ({
  key: k,
  code: k.length === 1 ? `Key${k.toUpperCase()}` : k,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  repeat: false,
  ...over
})
const free = { typing: false, arrows: false, menuOpen: false }

describe('keyAction', () => {
  it('seeks with Left and Right, sets the volume with Up and Down', () => {
    expect(keyAction(press('ArrowLeft'), free)).toBe('seekBack')
    expect(keyAction(press('ArrowRight'), free)).toBe('seekForward')
    expect(keyAction(press('ArrowUp'), free)).toBe('volumeUp')
    expect(keyAction(press('ArrowDown'), free)).toBe('volumeDown')
  })
  it('keeps arrows repeating while held', () =>
    expect(keyAction(press('ArrowRight', { repeat: true }), free)).toBe('seekForward'))
  it('leaves arrows to a list or slider, unless Shift is held', () => {
    const inList = { ...free, arrows: true }
    expect(keyAction(press('ArrowDown'), inList)).toBe('none')
    expect(keyAction(press('ArrowLeft'), inList)).toBe('none')
    expect(keyAction(press('ArrowDown', { shiftKey: true }), inList)).toBe('volumeDown')
    expect(keyAction(press('ArrowLeft', { shiftKey: true }), inList)).toBe('seekBack')
  })
  it('steps songs with Ctrl+Left and Ctrl+Right', () => {
    expect(keyAction(press('ArrowLeft', { ctrlKey: true }), free)).toBe('previous')
    expect(keyAction(press('ArrowRight', { ctrlKey: true }), free)).toBe('next')
    // a list has no use for Ctrl+arrows
    expect(keyAction(press('ArrowRight', { ctrlKey: true }), { ...free, arrows: true })).toBe(
      'next'
    )
  })
  it('goes back and forward with Alt+Left, Alt+Right and Backspace', () => {
    expect(keyAction(press('ArrowLeft', { altKey: true }), free)).toBe('back')
    expect(keyAction(press('ArrowRight', { altKey: true }), free)).toBe('forward')
    expect(keyAction(press('Backspace'), free)).toBe('back')
  })
  it('does not go back twice for a held Backspace', () =>
    expect(keyAction(press('Backspace', { repeat: true }), free)).toBe('none'))
  it('focuses search with Ctrl+F or /', () => {
    expect(keyAction(press('f', { ctrlKey: true }), free)).toBe('search')
    expect(keyAction(press('/', { code: 'Slash' }), free)).toBe('search')
  })
  it('finds Ctrl+F and Ctrl+, by the key place, so other layouts work', () => {
    expect(keyAction(press('а', { code: 'KeyF', ctrlKey: true }), free)).toBe('search')
    expect(keyAction(press('б', { code: 'Comma', ctrlKey: true }), free)).toBe('settings')
  })
  it('opens Settings with Ctrl+,', () =>
    expect(keyAction(press(',', { code: 'Comma', ctrlKey: true }), free)).toBe('settings'))
  it('keeps V, Q and Space', () => {
    expect(keyAction(press('v'), free)).toBe('visualizer')
    expect(keyAction(press('q'), free)).toBe('queue')
    expect(keyAction(press(' ', { code: 'Space' }), free)).toBe('toggle')
    expect(keyAction(press(' ', { code: 'Space', ctrlKey: true }), free)).toBe('block')
    expect(keyAction(press('v', { ctrlKey: true }), free)).toBe('none')
  })
  it('mutes with M, once for a held key, not while typing or with Ctrl', () => {
    expect(keyAction(press('m'), free)).toBe('mute')
    expect(keyAction(press('m', { repeat: true }), free)).toBe('none')
    expect(keyAction(press('m'), { ...free, typing: true })).toBe('none')
    expect(keyAction(press('m', { ctrlKey: true }), free)).toBe('none')
    // on a slider or in a list too: M is not an arrow
    expect(keyAction(press('m'), { ...free, arrows: true })).toBe('mute')
  })
  it('passes Escape on', () => expect(keyAction(press('Escape'), free)).toBe('escape'))
  it('leaves a text field its keys, but Ctrl+F and Ctrl+, still work', () => {
    const typing = { ...free, typing: true }
    for (const k of ['ArrowLeft', 'ArrowUp', 'Backspace', '/', 'v', 'q', 'Escape']) {
      expect(keyAction(press(k), typing)).toBe('none')
    }
    expect(keyAction(press('ArrowLeft', { ctrlKey: true }), typing)).toBe('none')
    expect(keyAction(press('ArrowLeft', { altKey: true }), typing)).toBe('none')
    expect(keyAction(press(' ', { code: 'Space' }), typing)).toBe('none')
    expect(keyAction(press('f', { ctrlKey: true }), typing)).toBe('search')
    expect(keyAction(press(',', { code: 'Comma', ctrlKey: true }), typing)).toBe('settings')
  })
  it('leaves an open menu every key but Escape', () => {
    const open = { ...free, menuOpen: true }
    for (const k of ['ArrowLeft', 'ArrowDown', 'Backspace', 'v']) {
      expect(keyAction(press(k), open)).toBe('none')
    }
    expect(keyAction(press(' ', { code: 'Space' }), open)).toBe('none')
    expect(keyAction(press('Escape'), open)).toBe('escape')
  })
})

describe('usesArrows', () => {
  const at = (
    tagName: string,
    type?: string,
    inList = false
  ): Parameters<typeof usesArrows>[0] => ({
    tagName,
    type,
    isContentEditable: false,
    closest: () => (inList ? ({} as Element) : null)
  })
  it('is true on a slider, a radio button, a select and in a list', () => {
    expect(usesArrows(at('INPUT', 'range'))).toBe(true)
    expect(usesArrows(at('INPUT', 'radio'))).toBe(true)
    expect(usesArrows(at('SELECT'))).toBe(true)
    expect(usesArrows(at('BUTTON', undefined, true))).toBe(true)
  })
  it('is false on a plain button or checkbox', () => {
    expect(usesArrows(at('BUTTON'))).toBe(false)
    expect(usesArrows(at('INPUT', 'checkbox'))).toBe(false)
  })
})

describe('escapeTarget', () => {
  it('closes the menu, then Settings, then the drawer', () => {
    expect(escapeTarget({ menu: true, settings: true, drawer: true })).toBe('menu')
    expect(escapeTarget({ menu: false, settings: true, drawer: true })).toBe('settings')
    expect(escapeTarget({ menu: false, settings: false, drawer: true })).toBe('drawer')
    expect(escapeTarget({ menu: false, settings: false, drawer: false })).toBe('none')
  })
})

describe('steps', () => {
  it('moves the volume by 5 within 0 to 100', () => {
    expect(volumeStep(50, 1)).toBe(55)
    expect(volumeStep(98, 1)).toBe(100)
    expect(volumeStep(3, -1)).toBe(0)
  })
  it('seeks by 5 seconds within the song', () => {
    expect(seekStep(10, 200, 1)).toBe(15)
    expect(seekStep(3, 200, -1)).toBe(0)
    expect(seekStep(198, 200, 1)).toBe(200)
  })
})

describe('sliderKey', () => {
  it('steps with the arrows, pages with Page Up and Down, ends with Home and End', () => {
    expect(sliderKey('ArrowRight', 60, 200, 5, 30)).toBe(65)
    expect(sliderKey('ArrowUp', 60, 200, 5, 30)).toBe(65)
    expect(sliderKey('ArrowLeft', 60, 200, 5, 30)).toBe(55)
    expect(sliderKey('ArrowDown', 60, 200, 5, 30)).toBe(55)
    expect(sliderKey('PageUp', 60, 200, 5, 30)).toBe(90)
    expect(sliderKey('PageDown', 20, 200, 5, 30)).toBe(0)
    expect(sliderKey('Home', 60, 200, 5, 30)).toBe(0)
    expect(sliderKey('End', 60, 200, 5, 30)).toBe(200)
    expect(sliderKey('ArrowRight', 198, 200, 5, 30)).toBe(200)
  })
  it('ignores other keys', () => expect(sliderKey('Enter', 60, 200, 5, 30)).toBe(null))
})

describe('listStep', () => {
  it('moves one row with Up and Down, stopping at the ends', () => {
    expect(listStep('ArrowDown', 3, 10, 5)).toBe(4)
    expect(listStep('ArrowUp', 3, 10, 5)).toBe(2)
    expect(listStep('ArrowUp', 0, 10, 5)).toBe(0)
    expect(listStep('ArrowDown', 9, 10, 5)).toBe(9)
  })
  it('jumps a page with Page Up and Down, to the ends with Home and End', () => {
    expect(listStep('PageDown', 3, 10, 5)).toBe(8)
    expect(listStep('PageDown', 7, 10, 5)).toBe(9)
    expect(listStep('PageUp', 3, 10, 5)).toBe(0)
    expect(listStep('Home', 6, 10, 5)).toBe(0)
    expect(listStep('End', 2, 10, 5)).toBe(9)
  })
  it('starts at the top when no row had focus', () =>
    expect(listStep('ArrowDown', -1, 10, 5)).toBe(0))
  it('does nothing in an empty list or for other keys', () => {
    expect(listStep('ArrowDown', -1, 0, 5)).toBe(null)
    expect(listStep('ArrowLeft', 2, 10, 5)).toBe(null)
    expect(listStep('Enter', 2, 10, 5)).toBe(null)
  })
})

describe('removing a row (ticket 071)', () => {
  const key = (
    k: string,
    more: Partial<KeyboardEvent> = {}
  ): Parameters<typeof isRemoveKey>[0] => ({
    key: k,
    code: k,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    ...more
  })

  it('takes Delete alone, not Backspace, a held key or one with a modifier', () => {
    expect(isRemoveKey(key('Delete'))).toBe(true)
    expect(isRemoveKey(key('Backspace'))).toBe(false)
    expect(isRemoveKey(key('Delete', { repeat: true }))).toBe(false)
    expect(isRemoveKey(key('Delete', { shiftKey: true }))).toBe(false)
    expect(isRemoveKey(key('Delete', { ctrlKey: true }))).toBe(false)
  })

  it('focuses the row that took its place, else the new last one', () => {
    expect(rowAfterRemove(2, 9)).toBe(2)
    expect(rowAfterRemove(9, 9)).toBe(8)
    expect(rowAfterRemove(0, 0)).toBeNull()
  })
})

describe('radioStep', () => {
  it('moves with every arrow and wraps around', () => {
    expect(radioStep('ArrowRight', 0, 3)).toBe(1)
    expect(radioStep('ArrowDown', 2, 3)).toBe(0)
    expect(radioStep('ArrowLeft', 0, 3)).toBe(2)
    expect(radioStep('ArrowUp', 1, 3)).toBe(0)
  })
  it('goes to the ends with Home and End', () => {
    expect(radioStep('Home', 2, 3)).toBe(0)
    expect(radioStep('End', 0, 3)).toBe(2)
  })
  it('ignores other keys', () => expect(radioStep('Enter', 1, 3)).toBe(null))
})

describe('tabStep', () => {
  it('moves with Left and Right and wraps around', () => {
    expect(tabStep('ArrowRight', 0, 2)).toBe(1)
    expect(tabStep('ArrowRight', 1, 2)).toBe(0)
    expect(tabStep('ArrowLeft', 0, 2)).toBe(1)
  })
  it('goes to the ends with Home and End', () => {
    expect(tabStep('Home', 1, 3)).toBe(0)
    expect(tabStep('End', 0, 3)).toBe(2)
  })
  // the tabs lie in a row, so Up and Down still set the volume
  it('leaves Up, Down and other keys alone', () => {
    expect(tabStep('ArrowUp', 1, 2)).toBe(null)
    expect(tabStep('ArrowDown', 0, 2)).toBe(null)
    expect(tabStep('Enter', 0, 2)).toBe(null)
  })
})

describe('shortcuts', () => {
  it('opens the key list with ?, not while typing', () => {
    expect(keyAction(press('?', { code: 'Slash', shiftKey: true }), free)).toBe('keys')
    expect(
      keyAction(press('?', { code: 'Slash', shiftKey: true }), { ...free, typing: true })
    ).toBe('none')
  })
  it('leaves Shift+V, Shift+Backspace and Meta alone', () => {
    expect(keyAction(press('V', { shiftKey: true }), free)).toBe('none')
    expect(keyAction(press('Backspace', { shiftKey: true }), free)).toBe('none')
    expect(keyAction(press('f', { ctrlKey: true, metaKey: true }), free)).toBe('none')
    expect(keyAction(press('ArrowLeft', { metaKey: true }), free)).toBe('none')
  })
  it('does not repeat Alt+Left or V when held', () => {
    expect(keyAction(press('ArrowLeft', { altKey: true, repeat: true }), free)).toBe('none')
    expect(keyAction(press('v', { repeat: true }), free)).toBe('none')
  })
  // by the key's place: Ctrl+2 on AZERTY gives key "é"
  it('switches layout with Ctrl+1, Ctrl+2 and Ctrl+3, also in a text field', () => {
    expect(keyAction(press('1', { code: 'Digit1', ctrlKey: true }), free)).toBe('studio')
    expect(keyAction(press('é', { code: 'Digit2', ctrlKey: true }), free)).toBe('classic')
    const typing = { ...free, typing: true }
    expect(keyAction(press('3', { code: 'Digit3', ctrlKey: true }), typing)).toBe('focus')
    expect(keyAction(press('2', { code: 'Digit2' }), free)).toBe('none')
    expect(keyAction(press('2', { code: 'Digit2', ctrlKey: true, altKey: true }), free)).toBe(
      'none'
    )
    expect(keyAction(press('2', { code: 'Digit2', ctrlKey: true, repeat: true }), free)).toBe(
      'none'
    )
    expect(keyAction(press('1', { code: 'Numpad1', ctrlKey: true }), free)).toBe('none')
  })
  it('names the chord for each layout button', () => {
    expect(layoutChord('studio')).toBe('Ctrl+1')
    expect(layoutChord('classic')).toBe('Ctrl+2')
    expect(layoutChord('focus')).toBe('Ctrl+3')
  })
  it('joins chords of one line that do different things with the same keys held', () => {
    const c = (action: KeyAction, key: string, ctrl = false): Chord => ({ action, key, ctrl })
    const line = (...chords: Chord[]): string[] => shortcutKeys({ chords })
    expect(line(c('back', 'a'), c('forward', 'b'), c('back', 'c'))).toEqual(['A / B', 'C'])
    expect(line(c('back', 'a'), c('forward', 'b', true))).toEqual(['A', 'Ctrl+B'])
    expect(line(c('search', 'a'), c('search', 'b'))).toEqual(['A', 'B'])
  })
  it('lists every action keyAction can give', () => {
    const listed = new Set(shortcuts.flatMap((s) => s.chords.map((c) => c.action)))
    const all = [
      'toggle',
      'seekBack',
      'seekForward',
      'volumeUp',
      'volumeDown',
      'mute',
      'previous',
      'next',
      'back',
      'forward',
      'search',
      'settings',
      'keys',
      'escape',
      'visualizer',
      'queue',
      'studio',
      'classic',
      'focus'
    ]
    expect([...listed].sort()).toEqual(all.sort())
  })
  it('runs what each line of the list says', () => {
    for (const s of shortcuts)
      for (const c of s.chords) {
        const e = press(c.key, {
          code: c.code ? c.key : 'Other',
          ctrlKey: !!c.ctrl,
          altKey: !!c.alt
        })
        expect(keyAction(e, free)).toBe(c.action)
      }
  })
  it('writes the keys as the list shows them', () => {
    expect(shortcuts.map((s) => shortcutKeys(s).join(', '))).toEqual([
      'Space',
      '← / →',
      '↑ / ↓',
      'M',
      'Ctrl+← / Ctrl+→',
      'Ctrl+F, /',
      'Alt+← / Alt+→, Backspace',
      'Ctrl+,',
      '?',
      'Esc',
      'V',
      'Q',
      'Ctrl+1 / Ctrl+2 / Ctrl+3'
    ])
    expect(keyText('Alt+ArrowUp')).toBe('Alt+↑')
    expect(keyText('PageDown')).toBe('Page Down')
  })
  it('lists keys that listStep takes', () => {
    for (const k of listShortcuts.slice(0, 3).flatMap((s) => s.keys))
      expect(listStep(k, 2, 10, 3)).not.toBe(null)
  })
})
