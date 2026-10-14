// Search by field (ticket 128): the parser and the song test.
import { describe, expect, it } from 'vitest'
import {
  fieldHelp,
  hasQuery,
  hasText,
  parseQuery,
  songTest,
  splitTerms,
  type SongFields,
  type Term,
  unknownField
} from './search-query'

const day = 24 * 60 * 60 * 1000
const terms = (q: string): Term[] => parseQuery(q).terms

describe('parseQuery', () => {
  it('keeps plain words exactly as before: one text, spaces and quotes kept', () => {
    expect(parseQuery('  Red  Desert ')).toEqual({ text: 'red  desert', not: [], terms: [] })
    expect(parseQuery('"Heroes"').text).toBe('"heroes"')
    expect(parseQuery('Björk').text).toBe('bjork')
    expect(parseQuery('a - b').text).toBe('a - b')
    expect(parseQuery('Jay-Z').text).toBe('jay-z')
    expect(hasQuery(parseQuery('  '))).toBe(false)
  })

  it('reads each text field, in any case, with a word or a quoted phrase', () => {
    expect(terms('artist:Vale')).toEqual([{ field: 'artist', text: 'vale', not: false }])
    expect(terms('ALBUM:"Night Bus"')).toEqual([{ field: 'album', text: 'night bus', not: false }])
    expect(terms('title:intro')).toEqual([{ field: 'title', text: 'intro', not: false }])
    expect(terms('genre:"doom metal"')).toEqual([
      { field: 'genre', text: 'doom metal', not: false }
    ])
    expect(terms('codec:FLAC')).toEqual([{ field: 'codec', text: 'flac', not: false }])
    expect(terms('genre:Électro')).toEqual([{ field: 'genre', text: 'electro', not: false }])
  })

  it('runs a quote left open to the end, so a phrase being typed already finds', () => {
    expect(terms('genre:"doom met')).toEqual([{ field: 'genre', text: 'doom met', not: false }])
  })

  it('takes the plain words around fields as one text, quotes taken off', () => {
    expect(parseQuery('red genre:rock desert')).toEqual({
      text: 'red desert',
      not: [],
      terms: [{ field: 'genre', text: 'rock', not: false }]
    })
    expect(parseQuery('"night bus" year:2020').text).toBe('night bus')
  })

  it('reads numbers, ranges and comparisons', () => {
    const range = (q: string): [number, number] => {
      const t = terms(q)[0] as { min: number; max: number }
      return [t.min, t.max]
    }
    expect(range('year:1994')).toEqual([1994, 1994])
    expect(range('year:1990-1999')).toEqual([1990, 1999])
    expect(range('year:1999-1990')).toEqual([1990, 1999])
    expect(range('year:>2000')).toEqual([2001, Infinity])
    expect(range('year:>=2000')).toEqual([2000, Infinity])
    expect(range('year:<1980')).toEqual([-Infinity, 1979])
    expect(range('year:<=1980')).toEqual([-Infinity, 1980])
    expect(range('plays:0')).toEqual([0, 0])
    expect(range('plays:>10')).toEqual([11, Infinity])
  })

  it('reads times with their units; no sign means within', () => {
    expect(terms('added:<30d')).toEqual([
      { field: 'added', ago: 30 * day, newer: true, not: false }
    ])
    expect(terms('added:2w')).toEqual([{ field: 'added', ago: 14 * day, newer: true, not: false }])
    expect(terms('played:>1y')).toEqual([
      { field: 'played', ago: 365 * day, newer: false, not: false }
    ])
    expect(terms('played:>6m')).toEqual([
      { field: 'played', ago: 180 * day, newer: false, not: false }
    ])
  })

  it('reads is:loved', () => {
    expect(terms('is:loved')).toEqual([{ field: 'loved', not: false }])
    expect(terms('IS:Loved')).toEqual([{ field: 'loved', not: false }])
  })

  it('leaves out a field or a word after a "-"; all terms together', () => {
    expect(parseQuery('-genre:pop rock -live -"radio edit"')).toEqual({
      text: 'rock',
      not: ['live', 'radio edit'],
      terms: [{ field: 'genre', text: 'pop', not: true }]
    })
    expect(terms('genre:metal year:1990-1999 plays:0')).toHaveLength(3)
  })

  it('takes a field name typed wrong or a bad value as plain text', () => {
    expect(parseQuery('genr:rock')).toEqual({ text: 'genr:rock', not: [], terms: [] })
    expect(parseQuery('year:abc')).toEqual({ text: 'year:abc', not: [], terms: [] })
    expect(parseQuery('year:19x0 genre:rock')).toMatchObject({ text: 'year:19x0' })
    expect(parseQuery('plays:many').terms).toEqual([])
    expect(parseQuery('added:30').terms).toEqual([])
    expect(parseQuery('added:30x').terms).toEqual([])
    expect(parseQuery('is:great').text).toBe('is:great')
    expect(parseQuery('genre:').text).toBe('genre:')
    expect(parseQuery('genre:""').text).toBe('genre:""')
    expect(parseQuery('http://radio.example').text).toBe('http://radio.example')
    // a bad field after a "-" is a word to leave out
    expect(parseQuery('rock -year:abc').not).toEqual(['year:abc'])
  })

  it('takes a lone "-" as text', () => {
    expect(parseQuery('rock - genre:pop').text).toBe('rock -')
  })

  it('parses a query once and gives the same answer to each list', () => {
    expect(parseQuery('genre:rock')).toBe(parseQuery('genre:rock'))
  })
})

describe('unknownField', () => {
  it('names a word that looks like a field but is none', () => {
    expect(unknownField('genr:rock')).toBe('genr')
    expect(unknownField('rock -Yr:1990')).toBe('yr')
    expect(unknownField('genre:rock year:abc')).toBeUndefined()
    expect(unknownField('https://radio.example')).toBeUndefined()
    expect(unknownField('rock')).toBeUndefined()
  })
})

describe('hasText', () => {
  it('needs the plain words in one of the texts and no left-out word in any', () => {
    const q = parseQuery('night -live genre:x')
    expect(hasText(q, 'night bus')).toBe(true)
    expect(hasText(q, 'bus', 'night')).toBe(true)
    expect(hasText(q, 'night bus', 'live')).toBe(false)
    expect(hasText(q, 'day')).toBe(false)
    expect(hasText(parseQuery('genre:x'), 'anything')).toBe(true)
  })
})

interface Song {
  title?: string
  genre?: string
  codec?: string
  year?: number
  plays?: number
  played?: number
  added?: number
  loved?: boolean
}
const now = Date.UTC(2026, 9, 14)
const of: SongFields<Song> = {
  text: (s, f) =>
    f === 'title'
      ? (s.title ?? '')
      : f === 'codec'
        ? (s.codec ?? '')
        : f === 'genre'
          ? (s.genre ?? '')
          : '',
  num: (s, f) => s[f],
  loved: (s) => !!s.loved
}
const test = (q: string, s: Song): boolean => songTest(parseQuery(q).terms, of, now)(s)

describe('songTest', () => {
  it('matches text fields by part, each genre apart', () => {
    expect(test('genre:metal', { genre: 'rock\ndoom metal' })).toBe(true)
    expect(test('genre:"doom metal"', { genre: 'rock\ndoom metal' })).toBe(true)
    expect(test('genre:"rock doom"', { genre: 'rock\ndoom metal' })).toBe(false)
    expect(test('genre:pop', { genre: 'rock' })).toBe(false)
  })

  it('knows mp3, wav and ape by the names files give', () => {
    expect(test('codec:mp3', { codec: 'mpeg 1 layer 3' })).toBe(true)
    expect(test('codec:mpeg', { codec: 'mpeg 1 layer 3' })).toBe(true)
    expect(test('codec:wav', { codec: 'pcm' })).toBe(true)
    expect(test('codec:ape', { codec: "monkey's audio" })).toBe(true)
    expect(test('codec:mp3', { codec: 'flac' })).toBe(false)
  })

  it('matches years, and never an unknown one', () => {
    expect(test('year:1990-1999', { year: 1994 })).toBe(true)
    expect(test('year:1990-1999', { year: 2001 })).toBe(false)
    expect(test('year:<1980', { year: 0 })).toBe(false)
    expect(test('year:<1980', {})).toBe(false)
    expect(test('-year:<1980', {})).toBe(true)
  })

  it('counts plays, a song never played has 0', () => {
    expect(test('plays:0', { plays: 0 })).toBe(true)
    expect(test('plays:>10', { plays: 11 })).toBe(true)
    expect(test('plays:>10', { plays: 10 })).toBe(false)
  })

  it('compares times with now; a song never played has no last play', () => {
    expect(test('played:>1y', { played: now - 400 * day })).toBe(true)
    expect(test('played:>1y', { played: now - 10 * day })).toBe(false)
    expect(test('played:>1y', {})).toBe(false)
    expect(test('played:<7d', { played: now - 2 * day })).toBe(true)
    expect(test('added:<30d', { added: now - 29 * day })).toBe(true)
    expect(test('added:<30d', { added: now - 31 * day })).toBe(false)
    expect(test('added:<30d', { added: 0 })).toBe(false)
  })

  it('matches loved songs, and a "-" turns any term round', () => {
    expect(test('is:loved', { loved: true })).toBe(true)
    expect(test('is:loved', {})).toBe(false)
    expect(test('-is:loved', {})).toBe(true)
    expect(test('-genre:pop', { genre: 'synthpop' })).toBe(false)
  })

  it('needs every term', () => {
    const doom = { genre: 'doom metal', year: 1994, plays: 0 }
    expect(test('genre:metal year:1990-1999 plays:0', doom)).toBe(true)
    expect(test('genre:metal year:1990-1999 plays:0', { ...doom, plays: 3 })).toBe(false)
  })
})

describe('splitTerms', () => {
  it('gives the terms an item answers by name apart from its songs', () => {
    const t = terms('genre:metal -genre:doom year:1994')
    const { own, songs } = splitTerms(t, 'genre')
    expect(own.map((x) => x.field)).toEqual(['genre', 'genre'])
    expect(songs.map((x) => x.field)).toEqual(['year'])
  })
})

describe('fieldHelp', () => {
  it('has examples that are all fields', () => {
    for (const f of fieldHelp) {
      const q = parseQuery(f.example)
      expect(q.terms, f.example).toHaveLength(1)
      expect(q.text).toBe('')
    }
  })
})
