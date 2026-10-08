import { describe, expect, it } from 'vitest'
import { fallbackPalettes } from '../../../shared/palette'
import { drawArtistRings, drawArtistType, sizeOf } from './artist'
import { inksOf } from './colors'
import { drawArtistOf } from './draw'
import type { Drawing } from './drawing'
import { hashOf } from './drawing'
import { fakeCtx } from './test-ctx'

const drawing = (name: string): Drawing => ({
  inks: inksOf(fallbackPalettes(name), 'dark'),
  hash: hashOf(name),
  lengths: [],
  title: name,
  artist: '',
  small: false
})

describe('artist pictures', () => {
  it('writes the initials, in both styles', () => {
    for (const draw of [drawArtistRings, drawArtistType]) {
      const { x, drawn } = fakeCtx()
      draw(x, drawing('The Ochre Band'))
      expect(drawn.texts.map((t) => t.text)).toEqual(['OB'])
    }
  })

  it('writes one sign for Japanese, the first letters for Cyrillic, a note for none', () => {
    const text = (name: string): string[] => {
      const { x, drawn } = fakeCtx()
      drawArtistType(x, drawing(name))
      return drawn.texts.map((t) => t.text)
    }
    expect(text('東京ナイト')).toEqual(['東'])
    expect(text('Ледяные сны')).toEqual(['ЛС'])
    expect(text('')).toEqual(['♪'])
  })

  it('writes a long name as two letters too', () => {
    const { x, drawn } = fakeCtx()
    drawArtistRings(x, drawing('A'.repeat(100)))
    expect(drawn.texts).toHaveLength(1)
    expect(drawn.texts[0].text).toBe('A')
  })

  it('writes one sign bigger than a pair', () => {
    expect(sizeOf('東')).toBeGreaterThan(sizeOf('OB'))
  })

  it('has a picture for each style: genre and sound use the rings one for now', () => {
    expect(drawArtistOf('rings')).toBe(drawArtistRings)
    expect(drawArtistOf('type')).toBe(drawArtistType)
    expect(drawArtistOf('genre')).toBe(drawArtistRings)
    expect(drawArtistOf('sound')).toBe(drawArtistRings)
  })
})
