import { describe, expect, it } from 'vitest'
import {
  changeFixes,
  cleanFix,
  isKnownTagFixes,
  moveFixes,
  onlyDifferences,
  parseIds,
  parseTagChange,
  parseTagFixes,
  pruneFixes,
  sameValue,
  tagFixesData,
  type TagFix,
  type TagValues
} from './tag-fixes'

const tags = (more: Partial<TagValues> = {}): TagValues => ({
  title: 'Lucid',
  artist: 'Kai',
  album: 'Blue Hours',
  albumArtist: '',
  year: 1995,
  genre: ['Ambient'],
  no: 1,
  disc: 0,
  ...more
})

describe('the file', () => {
  it('reads fixes by item key and writes them back the same', () => {
    const raw = {
      version: 1,
      fixes: { 'files:a': { year: 1996, genre: ['Doom metal'] }, 'files:b': { title: '' } }
    }
    const f = parseTagFixes(raw)
    expect([...f]).toEqual([
      ['a', { year: 1996, genre: ['Doom metal'] }],
      ['b', { title: '' }]
    ])
    expect(tagFixesData(f)).toEqual(raw)
    expect(isKnownTagFixes(raw)).toBe(true)
  })

  it('drops a bad entry or a bad field alone', () => {
    const f = parseTagFixes({
      version: 1,
      fixes: {
        // another plugin's song, no plugin, a fix that is no object
        'radio:x': { year: 1990 },
        nokey: { year: 1990 },
        'files:c': 'year 1990',
        // a bad year next to a good title; unknown fields are left out
        'files:d': { year: 'soon', title: ' Fixed ', mood: 'sad' },
        // nothing good left
        'files:e': { year: -1, disc: 1.5, genre: [3] },
        'files:f': { no: 12, genre: [' Rock ', ''] }
      }
    })
    expect([...f]).toEqual([
      ['d', { title: 'Fixed' }],
      ['f', { genre: ['Rock'], no: 12 }]
    ])
  })

  it('knows only version 1; another shape gives no fixes', () => {
    expect(isKnownTagFixes({ version: 2, fixes: {} })).toBe(false)
    expect(isKnownTagFixes({ version: 1 })).toBe(false)
    expect(parseTagFixes({ version: 1, fixes: [] }).size).toBe(0)
    expect(parseTagFixes(undefined).size).toBe(0)
  })

  it('takes no value too long or too big', () => {
    expect(cleanFix({ title: 'x'.repeat(1001) })).toBeUndefined()
    expect(cleanFix({ year: 10000 })).toBeUndefined()
    expect(cleanFix({ genre: Array(21).fill('Rock') })).toBeUndefined()
    expect(cleanFix({ year: 0, no: 9999 })).toEqual({ year: 0, no: 9999 })
  })
})

describe('only differences are kept', () => {
  it('drops the fields the file has itself', () => {
    expect(onlyDifferences({ year: 1995, title: 'Lucid (Live)' }, tags())).toEqual({
      title: 'Lucid (Live)'
    })
    expect(onlyDifferences({ year: 1995 }, tags())).toBeUndefined()
  })

  it('counts genres as the library splits them', () => {
    expect(sameValue('genre', ['Rock; Metal'], ['Rock', 'Metal'])).toBe(true)
    expect(sameValue('genre', ['Rock, Metal'], ['Rock', 'Metal'])).toBe(true)
    expect(sameValue('genre', ['Metal', 'Rock'], ['Rock', 'Metal'])).toBe(false)
    expect(onlyDifferences({ genre: ['Ambient'] }, tags())).toBeUndefined()
  })
})

describe('changeFixes', () => {
  const files: Record<string, TagValues> = {
    a: tags(),
    b: tags({ title: 'Tide', no: 2, year: 1994 }),
    c: tags({ title: 'Glass', no: 3 })
  }
  const fileOf = (id: string): TagValues | undefined => files[id]

  it('sets the typed fields on every song, keeping each one only where it differs', () => {
    const r = changeFixes(
      new Map(),
      { edit: { ids: ['a', 'b', 'c'], set: { year: 1995, genre: ['Doom metal'] }, reset: [] } },
      fileOf
    )
    expect([...r!.fixes]).toEqual([
      ['a', { genre: ['Doom metal'] }],
      ['b', { year: 1995, genre: ['Doom metal'] }],
      ['c', { genre: ['Doom metal'] }]
    ])
    // none had a fix before
    expect(r!.before).toEqual({ a: null, b: null, c: null })
  })

  it('keeps the other fields of a fix, and puts a field back to the file', () => {
    const fixes = new Map<string, TagFix>([['b', { year: 1995, title: 'Tide (Edit)' }]])
    const r = changeFixes(
      fixes,
      { edit: { ids: ['b'], set: { album: 'Blue Hours II' }, reset: ['year'] } },
      fileOf
    )
    expect(r!.fixes.get('b')).toEqual({ title: 'Tide (Edit)', album: 'Blue Hours II' })
    expect(r!.before).toEqual({ b: { year: 1995, title: 'Tide (Edit)' } })
  })

  it('drops a fix with nothing left, and changes nothing for the same values', () => {
    const fixes = new Map<string, TagFix>([['a', { year: 2000 }]])
    const r = changeFixes(fixes, { edit: { ids: ['a'], set: {}, reset: ['year'] } }, fileOf)
    expect(r!.fixes.size).toBe(0)
    expect(
      changeFixes(fixes, { edit: { ids: ['a'], set: { year: 2000 }, reset: [] } }, fileOf)
    ).toBe(undefined)
    // a song not in the library is passed over
    expect(
      changeFixes(new Map(), { edit: { ids: ['gone'], set: { year: 1 }, reset: [] } }, fileOf)
    ).toBeUndefined()
  })

  it('undoes with a put of what the songs had, and Undo all clears every fix', () => {
    const start = new Map<string, TagFix>([['a', { year: 2000 }]])
    const edit = changeFixes(
      start,
      { edit: { ids: ['a', 'b'], set: { genre: ['Jazz'] }, reset: [] } },
      fileOf
    )!
    const undo = changeFixes(edit.fixes, { put: edit.before }, fileOf)!
    expect([...undo.fixes]).toEqual([...start])
    const all = changeFixes(edit.fixes, { clear: true }, fileOf)!
    expect(all.fixes.size).toBe(0)
    expect(all.before).toEqual({ a: { year: 2000, genre: ['Jazz'] }, b: { genre: ['Jazz'] } })
    expect([...changeFixes(new Map(), { put: all.before }, fileOf)!.fixes]).toEqual([...edit.fixes])
  })
})

describe('songs opened from outside the library (ticket 124)', () => {
  it('are never changed, read or kept', () => {
    const fileOf = (): TagValues => tags()
    expect(
      changeFixes(new Map(), { edit: { ids: ['/m/a.flac'], set: { year: 1 }, reset: [] } }, fileOf)
    ).toBeUndefined()
    expect(changeFixes(new Map(), { put: { '/m/a.flac': { year: 1 } } }, fileOf)).toBeUndefined()
    const raw = { version: 1, fixes: { 'files:/m/a.flac': { year: 1 }, 'files:a': { year: 2 } } }
    expect([...parseTagFixes(raw)]).toEqual([['a', { year: 2 }]])
  })
})

describe('parseTagChange', () => {
  it('takes good changes', () => {
    expect(parseTagChange({ edit: { ids: ['a'], set: { year: 1996 }, reset: ['genre'] } })).toEqual(
      { edit: { ids: ['a'], set: { year: 1996 }, reset: ['genre'] } }
    )
    expect(parseTagChange({ put: { a: null, b: { title: 'X' } } })).toEqual({
      put: { a: null, b: { title: 'X' } }
    })
    expect(parseTagChange({ clear: true })).toEqual({ clear: true })
  })

  it('turns down a bad one whole', () => {
    for (const bad of [
      null,
      { clear: 'yes' },
      { edit: { ids: 'a', set: {}, reset: [] } },
      { edit: { ids: [''], set: {}, reset: [] } },
      { edit: { ids: ['a'], set: { year: 'soon' }, reset: [] } },
      { edit: { ids: ['a'], set: { mood: 'sad' }, reset: [] } },
      { edit: { ids: ['a'], set: {}, reset: ['mood'] } },
      { put: { a: { year: -5 } } },
      { put: { a: 'x' } }
    ])
      expect(parseTagChange(bad)).toBeUndefined()
    expect(parseIds(['a', 2])).toBeUndefined()
  })
})

describe('moves and prune', () => {
  it('moves fixes with their songs; a fix already there stays', () => {
    const fixes = new Map<string, TagFix>([
      ['a', { year: 1 }],
      ['b', { year: 2 }],
      ['c', { year: 3 }]
    ])
    const moved = moveFixes(fixes, { a: 'a2', b: 'c' })
    expect(Object.fromEntries(moved)).toEqual({ a2: { year: 1 }, c: { year: 3 } })
    expect(moveFixes(fixes, { x: 'y' })).toBe(fixes)
  })

  it('drops songs gone and fields the file now has itself', () => {
    const fixes = new Map<string, TagFix>([
      ['a', { year: 1995, title: 'New' }],
      ['gone', { year: 1 }],
      ['c', { title: 'Other' }]
    ])
    const out = pruneFixes(fixes, (id) => (id === 'gone' ? undefined : tags()))
    expect(Object.fromEntries(out)).toEqual({ a: { title: 'New' }, c: { title: 'Other' } })
    const same = new Map<string, TagFix>([['a', { title: 'New' }]])
    expect(pruneFixes(same, () => tags())).toBe(same)
  })
})
