import { describe, expect, it } from 'vitest'
import { cleanNames, editArtist, maxNames, parseChanges } from './artist-edit'
import type { Artist, ArtistTag } from './artists'

describe('cleanNames', () => {
  it('trims, drops empty names and keeps one spelling per artist', () => {
    expect(cleanNames(['  Sadness ', '', 'sadness', 'Stellafera', 3])).toEqual([
      'Sadness',
      'Stellafera'
    ])
  })

  it('keeps a few names at most', () => {
    const many = Array.from({ length: 50 }, (_, i) => `Band ${i}`)
    expect(cleanNames(many)).toHaveLength(maxNames)
  })

  it('is empty for anything but a list', () => {
    expect(cleanNames('Sadness')).toEqual([])
  })
})

describe('parseChanges', () => {
  it('takes new names and resets', () => {
    expect(parseChanges({ kino: [' Кино '], queen: null })).toEqual({ kino: ['Кино'], queen: null })
  })

  it('takes AI links to put back', () => {
    expect(parseChanges({ bjork: { ai: [' Björk '] } })).toEqual({ bjork: { ai: ['Björk'] } })
    expect(parseChanges({ bjork: { ai: [] } })).toBeUndefined()
    expect(parseChanges({ bjork: { you: ['Björk'] } })).toBeUndefined()
  })

  it('refuses the whole message when one part is wrong', () => {
    expect(parseChanges({ kino: ['Кино'], 'Not A Key': ['X'] })).toBeUndefined()
    expect(parseChanges({ kino: [''] })).toBeUndefined()
    expect(parseChanges({ kino: 'Кино' })).toBeUndefined()
    expect(parseChanges(['kino'])).toBeUndefined()
    expect(parseChanges({})).toBeUndefined()
  })
})

describe('editArtist', () => {
  const artist = (name: string, tags: ArtistTag[]): Artist => ({
    key: name.toLowerCase().replace(/\s+/g, ''),
    name,
    albums: [],
    also: [],
    tags
  })

  it('renames an artist that comes from its own tag', () => {
    const a = artist('kino', [{ key: 'kino', name: 'kino' }])
    expect(editArtist(a, ['Кино'])).toEqual({ kino: ['Кино'] })
  })

  it('splits a joint credit', () => {
    const a = artist('sadness, stellafera', [
      { key: 'sadness,stellafera', name: 'sadness, stellafera' }
    ])
    expect(editArtist(a, ['Sadness', ' Stellafera ', ''])).toEqual({
      'sadness,stellafera': ['Sadness', 'Stellafera']
    })
  })

  it('saves nothing when the name is the tag as it is, or there is no name', () => {
    const a = artist('Queen', [{ key: 'queen', name: 'Queen' }])
    expect(editArtist(a, ['Queen'])).toEqual({})
    expect(editArtist(a, ['  '])).toEqual({})
  })

  it('renames the artist inside the splits it comes from too', () => {
    const a = artist('Sadness', [
      { key: 'sadness', name: 'Sadness' },
      { key: 'sadness,stellafera', name: 'sadness, stellafera', names: ['Sadness', 'Stellafera'] }
    ])
    expect(editArtist(a, ['SADNESS'])).toEqual({
      sadness: ['SADNESS'],
      'sadness,stellafera': ['SADNESS', 'Stellafera']
    })
  })

  it('goes back to the tag when the names are the tag again', () => {
    const a = artist('Кино', [{ key: 'kino', name: 'kino', names: ['Кино'] }])
    expect(editArtist(a, ['kino'])).toEqual({ kino: null })
  })

  it('puts a grouped tag back to its own name, linked by you so the AI leaves it alone', () => {
    const a = artist('Björk', [
      { key: 'björk', name: 'Björk' },
      { key: 'bjork', name: 'Bjork', names: ['Björk'], grouped: true }
    ])
    expect(editArtist(a, ['Bjork'])).toEqual({ björk: ['Bjork'], bjork: null })
  })
})
