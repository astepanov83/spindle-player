import { describe, expect, it } from 'vitest'
import {
  applyChanges,
  cleanNames,
  creditOf,
  dropUnused,
  editArtist,
  maxNames,
  parseChanges,
  parseOverrides,
  serializeOverrides,
  tagKeys,
  type ArtistOverrides
} from './artist-overrides'
import type { Artist, ArtistTag } from './artists'

const overrides = (o: Record<string, string[]>): ArtistOverrides => new Map(Object.entries(o))

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

describe('the file', () => {
  it('reads back what it wrote', () => {
    const o = overrides({ 'sadness,stellafera': ['Sadness', 'Stellafera'], kino: ['Кино'] })
    expect(parseOverrides(JSON.parse(JSON.stringify(serializeOverrides(o))))).toEqual(o)
  })

  it('skips keys artistKey would not make and empty lists', () => {
    const o = parseOverrides({
      version: 1,
      artists: { 'Big Name': ['X'], ok: ['Y'], empty: [], bad: 'Z' }
    })
    expect(o).toEqual(overrides({ ok: ['Y'] }))
  })

  it('is empty for another version or no file', () => {
    expect(parseOverrides({ version: 2, artists: { a: ['A'] } }).size).toBe(0)
    expect(parseOverrides(undefined).size).toBe(0)
  })
})

describe('parseChanges', () => {
  it('takes new names and resets', () => {
    expect(parseChanges({ kino: [' Кино '], queen: null })).toEqual({ kino: ['Кино'], queen: null })
  })

  it('refuses the whole message when one part is wrong', () => {
    expect(parseChanges({ kino: ['Кино'], 'Not A Key': ['X'] })).toBeUndefined()
    expect(parseChanges({ kino: [''] })).toBeUndefined()
    expect(parseChanges({ kino: 'Кино' })).toBeUndefined()
    expect(parseChanges(['kino'])).toBeUndefined()
    expect(parseChanges({})).toBeUndefined()
  })
})

describe('applyChanges', () => {
  it('sets, replaces and removes, and says whether anything changed', () => {
    const o = overrides({ kino: ['Кино'] })
    expect(applyChanges(o, { kino: ['Кино'] })).toBe(false)
    expect(applyChanges(o, { kino: ['KINO'], queen: ['Queen'] })).toBe(true)
    expect(o).toEqual(overrides({ kino: ['KINO'], queen: ['Queen'] }))
    expect(applyChanges(o, { kino: null, nope: null })).toBe(true)
    expect(applyChanges(o, { nope: null })).toBe(false)
    expect(o).toEqual(overrides({ queen: ['Queen'] }))
  })
})

describe('dropUnused', () => {
  it('drops overrides of tags that are gone', () => {
    const o = overrides({ kino: ['Кино'], gone: ['X'] })
    expect(dropUnused(o, new Set(['kino']))).toBe(true)
    expect(o).toEqual(overrides({ kino: ['Кино'] }))
    expect(dropUnused(o, new Set(['kino']))).toBe(false)
  })
})

describe('creditOf', () => {
  const o = overrides({ kino: ['Кино'], 'sadness,stellafera': ['Sadness', 'Stellafera'] })

  it('keeps a tag with no override as it is', () => {
    expect(creditOf('Queen', o)).toEqual({ artist: 'Queen' })
  })

  it('renames, matching the tag by key', () => {
    expect(creditOf('KINO', o)).toEqual({ artist: 'Кино', artistTag: 'KINO' })
  })

  it('splits, showing the names joined', () => {
    expect(creditOf('Sadness, Stellafera', o)).toEqual({
      artist: 'Sadness, Stellafera',
      artists: ['Sadness', 'Stellafera'],
      artistTag: 'Sadness, Stellafera'
    })
  })

  it('does not look the new names up again', () => {
    const chain = overrides({ a: ['B'], b: ['C'] })
    expect(creditOf('A', chain).artist).toBe('B')
  })

  describe('with artist groups (ticket 068)', () => {
    const groups = new Map([
      ['bjork', 'Björk'],
      ['kino', 'Kino'],
      ['björk', 'Björk']
    ])

    it('shows the group name for a tag with no override, marked grouped', () => {
      expect(creditOf('Bjork', new Map(), groups)).toEqual({
        artist: 'Björk',
        artistTag: 'Bjork',
        grouped: true
      })
    })

    it('leaves a tag that is spelled as the group name as it is', () => {
      expect(creditOf('Björk', new Map(), groups)).toEqual({ artist: 'Björk' })
    })

    it('shows an override that is the tag itself as the plain tag, keeping the group off', () => {
      const own = overrides({ bjork: ['Bjork'] })
      expect(creditOf('Bjork', own, groups)).toEqual({ artist: 'Bjork' })
      // another spelling of the same key is still renamed
      expect(creditOf('BJORK', own, groups)).toEqual({ artist: 'Bjork', artistTag: 'BJORK' })
    })

    it('lets a manual override win over the group', () => {
      expect(creditOf('kino', o, groups)).toEqual({ artist: 'Кино', artistTag: 'kino' })
    })
  })
})

describe('tagKeys', () => {
  it('keys the tags, not the names shown', () => {
    expect(tagKeys([{ artist: 'Кино', artistTag: 'kino' }, { artist: 'Queen' }])).toEqual(
      new Set(['kino', 'queen'])
    )
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

  it("saves a grouped tag's own name, so it does not go back to its group", () => {
    const a = artist('Björk', [
      { key: 'björk', name: 'Björk' },
      { key: 'bjork', name: 'Bjork', names: ['Björk'], grouped: true }
    ])
    expect(editArtist(a, ['Bjork'])).toEqual({ björk: ['Bjork'], bjork: ['Bjork'] })
  })
})
