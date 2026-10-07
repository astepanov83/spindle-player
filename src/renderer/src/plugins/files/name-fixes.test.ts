import { describe, expect, it } from 'vitest'
import type { Artist, ArtistTag } from '../../../../shared/plugins/files/artists'
import { fixCount, keepSeparate, nameFixes, tagNote } from './name-fixes'

const artist = (name: string, ...tags: ArtistTag[]): Artist => ({
  key: name.toLowerCase(),
  name,
  albums: [],
  also: [],
  tags
})
const tag = (name: string, names?: string[], grouped?: true): ArtistTag => ({
  key: name.toLowerCase().replace(/\s+/g, ''),
  name,
  ...(names ? { names } : {}),
  ...(grouped ? { grouped } : {})
})

describe('nameFixes', () => {
  const split = tag('Daft Punk & Pharrell', ['Daft Punk', 'Pharrell'], true)
  const artists = [
    artist('Beyoncé', tag('Beyoncé'), tag('Beyonce', ['Beyoncé'], true)),
    artist('Daft Punk', tag('Daft Punk'), split),
    artist('Pharrell', split),
    artist('Abba', tag('ABBA!', ['Abba'], true)),
    artist('Кино', tag('Kino', ['Кино'])),
    artist('Magogaio', tag('Magogaio/Sadness', ['Magogaio', 'Sadness']))
  ]

  it('lists each changed tag once, in its group, and leaves out tags shown as written', () => {
    const f = nameFixes(artists)
    expect(f.split).toEqual([
      {
        key: 'daftpunk&pharrell',
        tag: 'Daft Punk & Pharrell',
        names: ['Daft Punk', 'Pharrell'],
        byAi: true
      }
    ])
    // in the order of the artist they go to
    expect(f.joined.map((x) => [x.tag, x.names])).toEqual([
      ['ABBA!', ['Abba']],
      ['Beyonce', ['Beyoncé']]
    ])
    expect(f.yours.map((x) => x.tag)).toEqual(['Kino', 'Magogaio/Sadness'])
    expect(fixCount(f)).toBe(5)
  })

  it('has nothing when no link changed a name', () => {
    const f = nameFixes([artist('Abba', tag('Abba'))])
    expect(f).toEqual({ split: [], joined: [], yours: [] })
    expect(fixCount(f)).toBe(0)
  })
})

describe('tagNote', () => {
  it('says what changed the tag and who did it', () => {
    expect(tagNote(tag('Abba'))).toBe('')
    expect(tagNote(tag('Kino', ['Кино']))).toBe(' (renamed)')
    expect(tagNote(tag('A/B', ['A', 'B']))).toBe(' (split)')
    expect(tagNote(tag('Beyonce', ['Beyoncé'], true))).toBe(' (joined by AI)')
    expect(tagNote(tag('A & B', ['A', 'B'], true))).toBe(' (split by AI)')
  })
})

describe('keepSeparate', () => {
  it('pins the tag as its own name, and its Undo puts the link back as it was', () => {
    expect(keepSeparate(tag('Beyonce', ['Beyoncé'], true))).toEqual({
      keep: { beyonce: null },
      undo: { beyonce: { ai: ['Beyoncé'] } }
    })
    expect(keepSeparate(tag('A/B', ['A', 'B']))).toEqual({
      keep: { 'a/b': null },
      undo: { 'a/b': ['A', 'B'] }
    })
    expect(keepSeparate(tag('Abba'))).toBeUndefined()
  })
})
