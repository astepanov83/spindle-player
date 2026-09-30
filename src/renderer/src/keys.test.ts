import { describe, expect, it } from 'vitest'
import { isTyping, spaceAction } from './keys'

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
