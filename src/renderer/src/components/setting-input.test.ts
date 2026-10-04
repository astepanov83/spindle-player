import { describe, expect, it } from 'vitest'
import { optionText, textToSend } from './setting-input'

describe('textToSend', () => {
  it('sends a changed draft', () => {
    expect(textToSend('abc', '')).toBe('abc')
    expect(textToSend('', 'abc')).toBe('')
  })

  it('sends nothing when the box was not touched or is back to what is known', () => {
    expect(textToSend(undefined, 'abc')).toBeUndefined()
    expect(textToSend('abc', 'abc')).toBeUndefined()
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
