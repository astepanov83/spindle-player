import { describe, expect, it } from 'vitest'
import { optionText, shownText, textToSend } from './setting-input'

describe('textToSend', () => {
  it('sends a changed draft', () => {
    expect(textToSend({ text: 'abc', base: '' }, '')).toBe('abc')
    expect(textToSend({ text: '', base: 'abc' }, 'abc')).toBe('')
  })

  it('sends nothing when the box was not touched or is back to the value', () => {
    expect(textToSend(undefined, 'abc')).toBeUndefined()
    expect(textToSend({ text: 'abc', base: 'abc' }, 'abc')).toBeUndefined()
  })

  it('sends once for Enter and then blur', () => {
    const draft = { text: 'abc', base: '' }
    expect(textToSend(draft, '', draft)).toBeUndefined()
  })

  it('sends the same text again after the value moved', () => {
    // sent 'abc', main kept 'x' (or reset it), the user types 'abc' again
    expect(textToSend({ text: 'abc', base: 'x' }, 'x', { text: 'abc', base: '' })).toBe('abc')
  })

  it('drops a draft made on an older value', () => {
    expect(textToSend({ text: 'abc', base: '' }, 'x')).toBeUndefined()
  })
})

describe('shownText', () => {
  it('shows the draft while the value is the one it was typed on', () => {
    expect(shownText({ text: 'abc', base: 'x' }, 'x')).toBe('abc')
    expect(shownText(undefined, 'x')).toBe('x')
  })

  it('shows the new value when it changed under the draft', () => {
    expect(shownText({ text: 'abc', base: 'x' }, 'trimmed')).toBe('trimmed')
  })
})

describe('optionText', () => {
  it('puts the note after the label', () => {
    expect(optionText({ label: 'Fast', note: 'cheap' })).toBe('Fast - cheap')
  })

  it('is the label alone with no note', () => {
    expect(optionText({ label: 'Fast' })).toBe('Fast')
  })
})
