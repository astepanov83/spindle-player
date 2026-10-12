import { describe, expect, it } from 'vitest'
import {
  canLove,
  isKnownLovedFile,
  lovedFile,
  moveLoved,
  parseLoved,
  parseLoveKeys,
  setLoved,
  type Loved
} from './loved'

describe('canLove', () => {
  it('loves music files only: not radio, not MFP', () => {
    expect(canLove('files:abc')).toBe(true)
    expect(canLove('radio:rb-1')).toBe(false)
    expect(canLove('mfp:ep1#2')).toBe(false)
    expect(canLove('files:')).toBe(false)
    expect(canLove('nope:abc')).toBe(false)
    expect(canLove(7)).toBe(false)
    expect(canLove('files:' + 'x'.repeat(5000))).toBe(false)
  })
})

describe('parseLoved', () => {
  it('reads back what lovedFile wrote', () => {
    const loved: Loved = { 'files:a': 1000, 'files:b': 5 }
    expect(parseLoved(JSON.parse(JSON.stringify(lovedFile(loved))))).toEqual(loved)
  })

  it('drops bad entries on their own', () => {
    const raw = {
      version: 1,
      loved: {
        'files:ok': 10,
        'files:half': 10.4,
        'files:neg': -1,
        'files:text': '10',
        'files:inf': Infinity,
        'files:obj': { at: 1 },
        'radio:rb-1': 10,
        junk: 1
      }
    }
    expect(parseLoved(raw)).toEqual({ 'files:ok': 10, 'files:half': 10 })
  })

  it('gives no hearts for junk', () => {
    for (const raw of [undefined, null, 4, [], { loved: [] }, { loved: 'x' }])
      expect(parseLoved(raw)).toEqual({})
  })
})

describe('isKnownLovedFile', () => {
  it('knows version 1 only', () => {
    expect(isKnownLovedFile({ version: 1, loved: {} })).toBe(true)
    expect(isKnownLovedFile({ version: 2, loved: {} })).toBe(false)
    expect(isKnownLovedFile({ version: 1, keys: [] })).toBe(false)
    expect(isKnownLovedFile([])).toBe(false)
  })
})

describe('setLoved', () => {
  it('loves and unloves several songs, as a new object', () => {
    const one = setLoved({}, ['files:a', 'files:b'], true, 100)
    expect(one).toEqual({ 'files:a': 100, 'files:b': 100 })
    const two = setLoved(one, ['files:a'], false, 200)
    expect(two).toEqual({ 'files:b': 100 })
    expect(one).toEqual({ 'files:a': 100, 'files:b': 100 })
  })

  it('a song loved again keeps its first time', () => {
    const one = setLoved({}, ['files:a'], true, 100)
    expect(setLoved(one, ['files:a', 'files:b'], true, 200)).toEqual({
      'files:a': 100,
      'files:b': 200
    })
  })

  it('the same object when nothing changes, so nothing is saved', () => {
    const one: Loved = { 'files:a': 1 }
    expect(setLoved(one, ['files:a'], true, 5)).toBe(one)
    expect(setLoved(one, ['files:b'], false, 5)).toBe(one)
    expect(setLoved(one, [], true, 5)).toBe(one)
  })

  it('leaves out songs that cannot be loved', () => {
    expect(setLoved({}, ['radio:rb-1', 'mfp:e#1', 'files:a'], true, 1)).toEqual({ 'files:a': 1 })
  })
})

describe('parseLoveKeys', () => {
  it('takes a list of strings only', () => {
    expect(parseLoveKeys(['files:a', 'radio:x'])).toEqual(['files:a', 'radio:x'])
    expect(parseLoveKeys('files:a')).toBeUndefined()
    expect(parseLoveKeys(['files:a', 3])).toBeUndefined()
    expect(parseLoveKeys(null)).toBeUndefined()
  })
})

describe('moveLoved', () => {
  it("moves the plugin's ids, and keeps the earlier time of an id loved under both", () => {
    const loved: Loved = { 'files:old': 10, 'files:new': 50, 'files:moved': 7, 'files:stay': 1 }
    expect(moveLoved(loved, 'files', { old: 'new', moved: 'there' })).toEqual({
      'files:new': 10,
      'files:there': 7,
      'files:stay': 1
    })
  })

  it("leaves other plugins' keys alone, and the same object when nothing moved", () => {
    const loved: Loved = { 'files:a': 1 }
    expect(moveLoved(loved, 'mfp', { a: 'b' })).toBe(loved)
    expect(moveLoved(loved, 'files', { x: 'y' })).toBe(loved)
  })
})
