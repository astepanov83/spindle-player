import { describe, expect, it } from 'vitest'
import type { ItemKey } from './plugins/items'
import {
  isKnownPositionsFile,
  isLong,
  keepsPlace,
  movePositions,
  parsePositions,
  parsePositionSet,
  placeOf,
  positionsFile,
  positionsMax,
  setPosition,
  startOf,
  type Positions
} from './positions'

const hour = 3600

describe('keepsPlace', () => {
  it('keeps places of music files only: not radio, not MFP', () => {
    expect(keepsPlace('files:abc')).toBe(true)
    expect(keepsPlace('radio:rb-1')).toBe(false)
    expect(keepsPlace('mfp:ep1#2')).toBe(false)
    expect(keepsPlace('nope:abc')).toBe(false)
    expect(keepsPlace(7)).toBe(false)
  })
})

describe('the 20-minute rule', () => {
  it('counts songs of 20 minutes or more as long', () => {
    expect(isLong(20 * 60)).toBe(true)
    expect(isLong(hour)).toBe(true)
    expect(isLong(20 * 60 - 1)).toBe(false)
    expect(isLong(undefined)).toBe(false)
  })

  it('keeps nothing of a short song, not even a clear', () => {
    expect(placeOf(120, 19 * 60)).toBeUndefined()
    expect(placeOf(120, 0)).toBeUndefined()
  })

  it('keeps the place in a long song, to a tenth of a second', () => {
    expect(placeOf(120.04, hour)).toBe(120)
    expect(placeOf(2480.36, hour)).toBe(2480.4)
  })

  it('forgets it at the start and in the last 30 s', () => {
    expect(placeOf(0, hour)).toBeNull()
    expect(placeOf(5, hour)).toBeNull()
    expect(placeOf(5.5, hour)).toBe(5.5)
    expect(placeOf(hour - 31, hour)).toBe(hour - 31)
    expect(placeOf(hour - 30, hour)).toBeNull()
    expect(placeOf(hour, hour)).toBeNull()
    expect(placeOf(NaN, hour)).toBeNull()
  })
})

describe('startOf', () => {
  it('starts 5 s before the place, never before 0', () => {
    expect(startOf({ pos: 2480, last: 1 })).toBe(2475)
    expect(startOf({ pos: 3, last: 1 })).toBe(0)
    expect(startOf(undefined)).toBe(0)
  })
})

describe('setPosition', () => {
  it('keeps a place with its time, and forgets it', () => {
    const a = setPosition({}, 'files:a', 120, 1000)
    expect(a).toEqual({ 'files:a': { pos: 120, last: 1000 } })
    const b = setPosition(a, 'files:a', 130, 2000)
    expect(b).toEqual({ 'files:a': { pos: 130, last: 2000 } })
    expect(setPosition(b, 'files:a', null, 3000)).toEqual({})
  })

  it('gives the same object when nothing changes', () => {
    const a: Positions = { 'files:a': { pos: 120, last: 1000 } }
    expect(setPosition(a, 'files:a', 120, 2000)).toBe(a)
    expect(setPosition(a, 'files:b', null, 2000)).toBe(a)
    expect(setPosition(a, 'radio:rb-1', 50, 2000)).toBe(a)
    expect(setPosition(a, 'files:a', -1, 2000)).toBe(a)
    expect(setPosition(a, 'files:a', 0, 2000)).toBe(a)
  })

  it('keeps the 500 used last', () => {
    let all: Positions = {}
    for (let i = 0; i < positionsMax; i++) all = setPosition(all, `files:s${i}`, 100, i)
    expect(Object.keys(all)).toHaveLength(positionsMax)
    // s0 was used first; using s1 again keeps it
    all = setPosition(all, 'files:s1', 200, 1000)
    all = setPosition(all, 'files:new', 100, 1001)
    expect(Object.keys(all)).toHaveLength(positionsMax)
    expect(all['files:s0']).toBeUndefined()
    expect(all['files:s1']).toEqual({ pos: 200, last: 1000 })
    expect(all['files:new']).toEqual({ pos: 100, last: 1001 })
  })
})

describe('parsePositions', () => {
  it('reads back what positionsFile wrote', () => {
    const all: Positions = { 'files:a': { pos: 120.5, last: 1000 } }
    expect(parsePositions(JSON.parse(JSON.stringify(positionsFile(all))))).toEqual(all)
  })

  it('drops bad entries on their own', () => {
    const raw = {
      version: 1,
      at: {
        'files:ok': { pos: 10, last: 5 },
        'files:zero': { pos: 0, last: 5 },
        'files:neg': { pos: -1, last: 5 },
        'files:text': { pos: '10', last: 5 },
        'files:nolast': { pos: 10 },
        'files:num': 10,
        'mfp:e#1': { pos: 10, last: 5 },
        junk: { pos: 10, last: 5 }
      }
    }
    expect(parsePositions(raw)).toEqual({ 'files:ok': { pos: 10, last: 5 } })
  })

  it('keeps the newest 500 of a file with more', () => {
    const at: Record<string, unknown> = {}
    for (let i = 0; i < positionsMax + 10; i++) at[`files:s${i}`] = { pos: 100, last: i }
    const all = parsePositions({ version: 1, at })
    expect(Object.keys(all)).toHaveLength(positionsMax)
    expect(all['files:s9']).toBeUndefined()
    expect(all['files:s10']).toBeDefined()
  })

  it('gives no places for junk', () => {
    for (const raw of [undefined, null, 4, [], { at: [] }, { at: 'x' }])
      expect(parsePositions(raw)).toEqual({})
  })
})

describe('isKnownPositionsFile', () => {
  it('knows version 1 only', () => {
    expect(isKnownPositionsFile({ version: 1, at: {} })).toBe(true)
    expect(isKnownPositionsFile({ version: 2, at: {} })).toBe(false)
    expect(isKnownPositionsFile({ version: 1, positions: {} })).toBe(false)
    expect(isKnownPositionsFile([])).toBe(false)
  })
})

describe('parsePositionSet', () => {
  it('takes a place or null for a song that keeps one', () => {
    expect(parsePositionSet('files:a', 12.5)).toEqual({ key: 'files:a', pos: 12.5 })
    expect(parsePositionSet('files:a', null)).toEqual({ key: 'files:a', pos: null })
    expect(parsePositionSet('files:a', 0)).toBeUndefined()
    expect(parsePositionSet('files:a', '12')).toBeUndefined()
    expect(parsePositionSet('files:a', undefined)).toBeUndefined()
    expect(parsePositionSet('radio:rb-1', 12)).toBeUndefined()
    expect(parsePositionSet(5, 12)).toBeUndefined()
  })
})

describe('movePositions', () => {
  it('moves a place to the new id', () => {
    const all: Positions = { 'files:old': { pos: 10, last: 5 }, 'files:x': { pos: 20, last: 6 } }
    expect(movePositions(all, 'files', { old: 'new' })).toEqual({
      'files:new': { pos: 10, last: 5 },
      'files:x': { pos: 20, last: 6 }
    })
  })

  it('keeps the place used last when both ids have one', () => {
    const all: Positions = { 'files:old': { pos: 10, last: 9 }, 'files:new': { pos: 20, last: 6 } }
    expect(movePositions(all, 'files', { old: 'new' })).toEqual({
      'files:new': { pos: 10, last: 9 }
    })
    const older: Positions = {
      'files:old': { pos: 10, last: 1 },
      'files:new': { pos: 20, last: 6 }
    }
    expect(movePositions(older, 'files', { old: 'new' })).toEqual({
      'files:new': { pos: 20, last: 6 }
    })
  })

  it('gives the same object when nothing moved, or another plugin moved', () => {
    const all: Positions = { 'files:a': { pos: 10, last: 5 } }
    expect(movePositions(all, 'files', { b: 'c' })).toBe(all)
    expect(movePositions(all, 'mfp', { a: 'c' })).toBe(all)
  })

  it('moves two at once, also into each other', () => {
    const key = (id: string): ItemKey => `files:${id}`
    const all: Positions = { [key('a')]: { pos: 1, last: 1 }, [key('b')]: { pos: 2, last: 2 } }
    expect(movePositions(all, 'files', { a: 'b', b: 'c' })).toEqual({
      [key('b')]: { pos: 1, last: 1 },
      [key('c')]: { pos: 2, last: 2 }
    })
  })
})
