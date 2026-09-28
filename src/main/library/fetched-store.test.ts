import { describe, expect, it } from 'vitest'
import {
  dropGone,
  dropNotFound,
  fetchedCover,
  isFresh,
  notFoundMs,
  parseFetched,
  serializeFetched,
  type Fetched
} from './fetched-store'

const h = 'a'.repeat(40)
const has = (x: string): boolean => x === h

describe('parseFetched', () => {
  it('reads back what was saved', () => {
    const f: Fetched = new Map([
      ['al1', { hash: h, source: 'deezer', at: 5, key: 'x\0y' }],
      ['al2', { source: 'none', at: 6, key: 'p\0q' }]
    ])
    expect(parseFetched(JSON.parse(JSON.stringify(serializeFetched(f))))).toEqual(f)
  })

  it('drops another version and bad entries', () => {
    const one = { source: 'none', at: 1, key: 'k' }
    expect(parseFetched({ version: 2, albums: { al1: one } }).size).toBe(0)
    const bad = parseFetched({
      version: 1,
      albums: {
        a: { hash: 'zz', source: 'deezer', at: 1, key: 'k' },
        b: { hash: h, source: 'lastfm', at: 1, key: 'k' },
        c: { source: 'none', key: 'k' },
        d: { source: 'deezer', at: 1, key: 'k' },
        e: 'x'
      }
    })
    expect(bad.size).toBe(0)
    for (const raw of [undefined, null, [], 'x', { version: 1 }])
      expect(parseFetched(raw).size).toBe(0)
  })
})

describe('isFresh', () => {
  it('counts a found cover while its names match and its file is there', () => {
    const e = { hash: h, source: 'deezer' as const, at: 0, key: 'k' }
    expect(isFresh(e, 'k', 1e15, has)).toBe(true)
    expect(isFresh(e, 'other', 0, has)).toBe(false)
    expect(isFresh({ ...e, hash: 'b'.repeat(40) }, 'k', 0, has)).toBe(false)
    expect(isFresh(undefined, 'k', 0, has)).toBe(false)
  })

  it('counts not found for 30 days', () => {
    const e = { source: 'none' as const, at: 0, key: 'k' }
    expect(isFresh(e, 'k', notFoundMs - 1, has)).toBe(true)
    expect(isFresh(e, 'k', notFoundMs, has)).toBe(false)
  })
})

describe('fetchedCover', () => {
  it('gives the cover only for the same names', () => {
    const f: Fetched = new Map([['al1', { hash: h, source: 'itunes', at: 0, key: 'k' }]])
    expect(fetchedCover(f, 'al1', 'k', has)).toBe(h)
    expect(fetchedCover(f, 'al1', 'k2', has)).toBeUndefined()
    expect(fetchedCover(f, 'al2', 'k', has)).toBeUndefined()
  })
})

describe('dropping results', () => {
  it('drops not found results, then albums that are gone', () => {
    const f: Fetched = new Map([
      ['al1', { hash: h, source: 'itunes', at: 0, key: 'k' }],
      ['al2', { source: 'none', at: 0, key: 'k' }]
    ])
    expect(dropNotFound(f)).toBe(true)
    expect([...f.keys()]).toEqual(['al1'])
    expect(dropNotFound(f)).toBe(false)
    expect(dropGone(f, new Set(['al1']))).toBe(false)
    expect(dropGone(f, new Set(['al3']))).toBe(true)
    expect(f.size).toBe(0)
  })
})
