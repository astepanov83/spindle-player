import { describe, expect, it } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it('takes two words, leaving out small ones', () => {
    expect(initials('The Ochre Band')).toBe('OB')
    expect(initials('Marina Vale')).toBe('MV')
    expect(initials('Blue Hours of the Night')).toBe('BH')
  })

  it('works in Cyrillic', () => {
    expect(initials('Лунный Свет')).toBe('ЛС')
    expect(initials('песни ночи')).toBe('ПН')
  })

  it('takes one sign of a Japanese name', () => {
    expect(initials('東京ナイト')).toBe('東')
    expect(initials('ネオン')).toBe('ネ')
  })

  it('skips marks before a word', () => {
    expect(initials('Green Valley (Deluxe)')).toBe('GV')
    expect(initials('"Heroes"')).toBe('H')
  })

  it('keeps a name made only of small words, and gives a note for no name', () => {
    expect(initials('The The')).toBe('TT')
    expect(initials('')).toBe('♪')
    expect(initials(undefined)).toBe('♪')
    expect(initials('...')).toBe('.')
  })
})
