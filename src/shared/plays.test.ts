import { describe, expect, it } from 'vitest'
import {
  addPlay,
  countsPlays,
  isKnownPlaysFile,
  movePlays,
  parsePlays,
  playsFile,
  type Plays
} from './plays'

describe('countsPlays', () => {
  it('counts music files only: not radio, not MFP', () => {
    expect(countsPlays('files:abc')).toBe(true)
    expect(countsPlays('radio:rb-1')).toBe(false)
    expect(countsPlays('mfp:ep1#2')).toBe(false)
    expect(countsPlays('files:')).toBe(false)
    expect(countsPlays('nope:abc')).toBe(false)
    expect(countsPlays(7)).toBe(false)
    expect(countsPlays('files:' + 'x'.repeat(5000))).toBe(false)
  })
})

describe('parsePlays', () => {
  it('reads back what playsFile wrote', () => {
    const plays: Plays = { 'files:a': { n: 3, last: 1000 }, 'files:b': { n: 1, last: 5 } }
    expect(parsePlays(JSON.parse(JSON.stringify(playsFile(plays))))).toEqual(plays)
  })

  it('drops bad entries on their own', () => {
    const raw = {
      version: 1,
      plays: {
        'files:ok': { n: 2, last: 10 },
        'files:zero': { n: 0, last: 10 },
        'files:half': { n: 1.5, last: 10 },
        'files:nolast': { n: 1 },
        'files:neg': { n: 1, last: -1 },
        'radio:rb-1': { n: 4, last: 10 },
        junk: { n: 1, last: 1 }
      }
    }
    expect(parsePlays(raw)).toEqual({ 'files:ok': { n: 2, last: 10 } })
  })

  it('gives no plays for junk', () => {
    for (const raw of [undefined, null, 4, [], { plays: [] }]) expect(parsePlays(raw)).toEqual({})
  })
})

describe('isKnownPlaysFile', () => {
  it('knows version 1 only', () => {
    expect(isKnownPlaysFile({ version: 1, plays: {} })).toBe(true)
    expect(isKnownPlaysFile({ version: 2, plays: {} })).toBe(false)
    expect(isKnownPlaysFile({ version: 1 })).toBe(false)
    expect(isKnownPlaysFile([])).toBe(false)
  })
})

describe('addPlay', () => {
  it('counts one more and keeps the latest time', () => {
    const one = addPlay({}, 'files:a', 100)
    expect(one).toEqual({ 'files:a': { n: 1, last: 100 } })
    const two = addPlay(one, 'files:a', 200)
    expect(two['files:a']).toEqual({ n: 2, last: 200 })
    // a clock set back doesn't move the last play back
    expect(addPlay(two, 'files:a', 50)['files:a']).toEqual({ n: 3, last: 200 })
    // a new object: the page sorts again by it
    expect(two).not.toBe(one)
    expect(one['files:a'].n).toBe(1)
  })
})

describe('movePlays', () => {
  it("moves the plugin's ids and adds up an id that had plays under both", () => {
    const plays: Plays = {
      'files:old': { n: 2, last: 10 },
      'files:new': { n: 1, last: 50 },
      'files:moved': { n: 4, last: 7 },
      'files:stay': { n: 1, last: 1 },
      'mfp:old': { n: 9, last: 9 }
    }
    const out = movePlays(plays, 'files', { old: 'new', moved: 'there' })
    expect(out).toEqual({
      'files:new': { n: 3, last: 50 },
      'files:there': { n: 4, last: 7 },
      'files:stay': { n: 1, last: 1 },
      'mfp:old': { n: 9, last: 9 }
    })
  })

  it('carries what a move added on, for moves in a row', () => {
    const plays: Plays = { 'files:a': { n: 1, last: 1 }, 'files:b': { n: 2, last: 2 } }
    const out = movePlays(plays, 'files', { a: 'b', b: 'c' })
    expect(out).toEqual({ 'files:c': { n: 3, last: 2 } })
  })

  it('gives the same object when nothing moved', () => {
    const plays: Plays = { 'files:a': { n: 1, last: 1 } }
    expect(movePlays(plays, 'files', { x: 'y' })).toBe(plays)
    expect(movePlays(plays, 'mfp', { a: 'b' })).toBe(plays)
  })
})
