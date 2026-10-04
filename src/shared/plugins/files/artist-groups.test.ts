import { describe, expect, it } from 'vitest'
import {
  addAsked,
  addGroup,
  dropUnusedGroups,
  knownGroups,
  noGroups,
  parseGroups,
  serializeGroups,
  usedKeys,
  type ArtistGroups
} from './artist-groups'

const groups = (g: Record<string, string>, asked: string[] = []): ArtistGroups => ({
  groups: new Map(Object.entries(g)),
  asked: new Set(asked)
})

describe('the file', () => {
  it('reads back what it wrote', () => {
    const g = groups({ bjork: 'Björk', björk: 'Björk' }, ['bjork', 'björk', 'queen'])
    expect(parseGroups(JSON.parse(JSON.stringify(serializeGroups(g))))).toEqual(g)
  })

  it('skips keys artistKey would not make and names that are not names', () => {
    const g = parseGroups({
      version: 1,
      groups: { 'Big Name': 'X', ok: ' Y ', empty: '  ', bad: 3 },
      asked: ['ok', 'Not A Key', 7]
    })
    expect(g).toEqual(groups({ ok: 'Y' }, ['ok']))
  })

  it('is empty for another version, a wrong shape or no file', () => {
    expect(knownGroups({ version: 2, groups: {}, asked: [] })).toBe(false)
    expect(knownGroups({ version: 1, groups: {} })).toBe(false)
    expect(parseGroups({ version: 2, groups: { a: 'A' }, asked: [] })).toEqual(noGroups())
    expect(parseGroups(undefined)).toEqual(noGroups())
  })
})

describe('addGroup', () => {
  it('saves a new group under its name', () => {
    const g = noGroups()
    expect(addGroup(g, ['bjork', 'björk'], 'Björk')).toBe(true)
    expect(g).toEqual(groups({ bjork: 'Björk', björk: 'Björk' }))
    expect(addGroup(g, ['bjork', 'björk'], 'Björk')).toBe(false)
  })

  it('joins a saved group that shares a key, keeping the saved name', () => {
    const g = groups({ bjork: 'Björk', björk: 'Björk' })
    expect(addGroup(g, ['björk', 'bjørk'], 'Bjørk')).toBe(true)
    expect(g).toEqual(groups({ bjork: 'Björk', björk: 'Björk', bjørk: 'Björk' }))
  })

  it('makes one group of two saved ones it joins, under the first one name', () => {
    const g = groups({ beatles: 'The Beatles', thebeatles: 'The Beatles', 'beatles!': 'Beatles!' })
    addGroup(g, ['beatles', 'beatles!'], 'Beatles')
    expect(g).toEqual(
      groups({ beatles: 'The Beatles', thebeatles: 'The Beatles', 'beatles!': 'The Beatles' })
    )
  })

  it('skips keys artistKey would not make, and an empty name', () => {
    const g = noGroups()
    expect(addGroup(g, ['Not A Key'], 'X')).toBe(false)
    expect(addGroup(g, ['kino'], '  ')).toBe(false)
    expect(g).toEqual(noGroups())
  })
})

describe('addAsked', () => {
  it('adds keys and says whether anything changed', () => {
    const g = groups({}, ['queen'])
    expect(addAsked(g, ['queen', 'kino', 'Not A Key'])).toBe(true)
    expect(g.asked).toEqual(new Set(['queen', 'kino']))
    expect(addAsked(g, ['kino'])).toBe(false)
  })
})

describe('dropUnusedGroups', () => {
  it('drops group and asked keys of tags that are gone', () => {
    const g = groups({ bjork: 'Björk', gone: 'Björk' }, ['bjork', 'gone', 'queen'])
    expect(dropUnusedGroups(g, new Set(['bjork', 'queen']))).toBe(true)
    expect(g).toEqual(groups({ bjork: 'Björk' }, ['bjork', 'queen']))
    expect(dropUnusedGroups(g, new Set(['bjork', 'queen']))).toBe(false)
  })
})

describe('usedKeys', () => {
  it('keys the tags and the names overrides give, not the names groups give', () => {
    expect(
      usedKeys([
        { artist: 'Queen' },
        { artist: 'Sadness, Stellafera', artists: ['Sadness', 'Stellafera'], artistTag: 's & s' },
        { artist: 'Björk', artistTag: 'Bjork', grouped: true }
      ])
    ).toEqual(new Set(['queen', 's&s', 'sadness', 'stellafera', 'bjork']))
  })
})
