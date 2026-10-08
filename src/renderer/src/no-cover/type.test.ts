import { describe, expect, it } from 'vitest'
import { fallbackPalettes } from '../../../shared/palette'
import { inksOf } from './colors'
import { fakeCtx } from './fake-ctx'
import { atBottom, clampLines, drawType, fitTitle, wrapLines } from './type'

// one unit per character
const chars = (s: string): number => [...s].length

describe('wrapLines', () => {
  it('breaks between words', () => {
    expect(wrapLines('Blue Hours of the Night', 10, chars)).toEqual([
      'Blue Hours',
      'of the',
      'Night'
    ])
  })

  it('breaks inside a word wider than a line, as Japanese has no spaces', () => {
    expect(wrapLines('東京ナイトの夜の街', 4, chars)).toEqual(['東京ナイ', 'トの夜の', '街'])
    expect(wrapLines('a Supercalifragilistic b', 8, chars)).toEqual([
      'a',
      'Supercal',
      'ifragili',
      'stic b'
    ])
  })

  it('keeps Cyrillic words whole', () => {
    expect(wrapLines('Песни ночи', 6, chars)).toEqual(['Песни', 'ночи'])
  })
})

describe('clampLines', () => {
  it('cuts after n lines, the last ending in an ellipsis that fits', () => {
    expect(clampLines(['abcd', 'efgh', 'ijkl'], 2, 4, chars)).toEqual(['abcd', 'efg…'])
    expect(clampLines(['ab', 'cd'], 2, 4, chars)).toEqual(['ab', 'cd'])
  })
})

describe('fitTitle', () => {
  // a character is half the font size wide, as in the fake canvas
  const measureAt = (size: number) => (s: string) => chars(s) * size * 0.5

  it('sets a short title big', () => {
    expect(fitTitle('Blue Hours', measureAt)).toEqual({ size: 15, lines: ['Blue Hours'] })
  })

  it('sets a long title smaller, and cuts a very long one', () => {
    const long = 'Green Valley (Deluxe Anniversary Remastered Edition With Bonus Tracks)'
    const fit = fitTitle(long, measureAt)
    expect(fit.size).toBeLessThan(15)
    expect(fit.lines.join(' ')).toBe(long)
    const huge = fitTitle(Array.from({ length: 30 }, () => 'Remastered').join(' '), measureAt)
    expect(huge.size).toBe(10)
    expect(huge.lines).toHaveLength(6)
    expect(huge.lines[5].endsWith('…')).toBe(true)
  })
})

describe('drawType', () => {
  const base = {
    inks: inksOf(fallbackPalettes('a'), 'light'),
    lengths: [100],
    title: 'Песни ночи',
    artist: 'Лунный Свет'
  }

  it('shows only the initials when small', () => {
    const { x, drawn } = fakeCtx()
    drawType(x, { ...base, hash: 1, small: true })
    expect(drawn.texts.map((t) => t.text)).toEqual(['ПН'])
  })

  it('sets the title, then the artist in capitals under it', () => {
    const { x, drawn } = fakeCtx()
    drawType(x, { ...base, hash: 0, small: false })
    expect(drawn.texts.map((t) => t.text)).toEqual(['Песни ночи', 'ЛУННЫЙ СВЕТ'])
    expect(drawn.texts[0].font).toContain('Bricolage Grotesque')
  })

  it('puts the words at the top or the bottom, by the seed', () => {
    const top = [0, 1, 2, 3].find((h) => !atBottom(h << 7))!
    const bottom = [0, 1, 2, 3].find((h) => atBottom(h << 7))!
    const yOf = (hash: number): number => {
      const { x, drawn } = fakeCtx()
      drawType(x, { ...base, hash, small: false })
      return drawn.texts[0].y
    }
    expect(yOf(top << 7)).toBe(9)
    expect(yOf(bottom << 7)).toBeGreaterThan(50)
  })

  it('draws a note for an item with no title', () => {
    const { x, drawn } = fakeCtx()
    drawType(x, { ...base, title: '', artist: '', hash: 0, small: false })
    expect(drawn.texts.map((t) => t.text)).toEqual(['♪'])
  })
})
