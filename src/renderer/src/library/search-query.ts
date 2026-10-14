// Search by field (ticket 128): "genre:metal year:1990-1999 plays:0" in the
// same box as plain words. Parsed once per query; the test it makes is run
// per song. No DOM, no store: callers say how to read a song's fields.

// For search: lower case, and letters without their accents, so "bjork"
// finds Björk and "cafe" Café. Only the accents of U+0300-U+036F go: the
// Japanese voicing marks (が) are other marks and stay. Cyrillic й and ё
// lose theirs too, so и and е find them.
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase()
}

export type TextField = 'artist' | 'album' | 'title' | 'genre' | 'codec'
export type NumField = 'year' | 'plays'
// ms since 1970 of the last play and of when the album was added
export type TimeField = 'played' | 'added'

export type Term = { not: boolean } & (
  | { field: TextField; text: string }
  // both ends included
  | { field: NumField; min: number; max: number }
  // ago: ms before now; newer: true for "<" (less time ago than)
  | { field: TimeField; ago: number; newer: boolean }
  | { field: 'loved' }
)

export interface Query {
  // the plain words, folded, as one text a match must hold
  text: string
  // plain words after a "-": a match holds none of them
  not: string[]
  terms: Term[]
}

const textFields: readonly string[] = ['artist', 'album', 'title', 'genre', 'codec']

const day = 24 * 60 * 60 * 1000
const units: Record<string, number> = { d: day, w: 7 * day, m: 30 * day, y: 365 * day }

// One word or a quoted phrase, with its "-" and field name. A quote left
// open runs to the end, so a phrase being typed already finds something.
const tokenRe = /(-?)(?:([a-z]+):)?(?:"([^"]*)"?|(\S*))/iy

let last: { q: string; parsed: Query } | undefined

// Plain words work as before: with no field and no "-", the whole text is
// one plain text, quotes and all. A field name typed wrong or a bad value
// is plain text too, so a typo never empties the page. The last query is
// kept: a page asks for it in each of its lists.
export function parseQuery(q: string): Query {
  if (last?.q !== q) last = { q, parsed: parse(q) }
  return last.parsed
}

function parse(q: string): Query {
  const terms: Term[] = []
  const words: string[] = []
  const not: string[] = []
  const s = q.trim()
  let i = 0
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++
      continue
    }
    tokenRe.lastIndex = i
    const m = tokenRe.exec(s)!
    const raw = m[0]
    i += raw.length || 1
    const [, minus, name, quoted, bare] = m
    const value = quoted ?? bare ?? ''
    const neg = !!minus && raw.length > 1
    const term = name ? fieldTerm(name.toLowerCase(), value, neg) : undefined
    if (term) terms.push(term)
    else if (neg) not.push(fold(name ? raw.slice(1) : value))
    else words.push(name ? raw : value || raw)
  }
  if (!terms.length && !not.length) return { text: fold(s), not, terms }
  return { text: fold(words.join(' ')), not: not.filter((w) => w), terms }
}

function fieldTerm(name: string, value: string, not: boolean): Term | undefined {
  if (!value) return undefined
  const v = fold(value.trim())
  if (textFields.includes(name)) return v ? { field: name as TextField, text: v, not } : undefined
  if (name === 'year' || name === 'plays') {
    const r = numRange(v)
    return r && { field: name, ...r, not }
  }
  if (name === 'added' || name === 'played') {
    const m = /^([<>]?)(\d+)([dwmy])$/.exec(v)
    // "added:30d": added in the last 30 days
    return m ? { field: name, ago: +m[2] * units[m[3]], newer: m[1] !== '>', not } : undefined
  }
  if (name === 'is' && v === 'loved') return { field: 'loved', not }
  return undefined
}

// "1994", "1990-1999", ">2000", "<=1980"
function numRange(v: string): { min: number; max: number } | undefined {
  let m = /^(\d+)$/.exec(v)
  if (m) return { min: +m[1], max: +m[1] }
  m = /^(\d+)-(\d+)$/.exec(v)
  if (m) return { min: Math.min(+m[1], +m[2]), max: Math.max(+m[1], +m[2]) }
  m = /^([<>]=?)(\d+)$/.exec(v)
  if (!m) return undefined
  const n = +m[2]
  if (m[1] === '>') return { min: n + 1, max: Infinity }
  if (m[1] === '>=') return { min: n, max: Infinity }
  if (m[1] === '<') return { min: -Infinity, max: n - 1 }
  return { min: -Infinity, max: n }
}

const fieldNames = new Set([...textFields, 'year', 'plays', 'added', 'played', 'is'])

// A word that looks like a field but isn't one ("genr:rock"), for the hint
// under "No matches"; a link is not one.
export function unknownField(q: string): string | undefined {
  for (const m of q.matchAll(/(?:^|\s)-?([a-z]+):(?!\/\/)\S/gi)) {
    const name = m[1].toLowerCase()
    if (!fieldNames.has(name)) return name
  }
  return undefined
}

// The query has something to find: plain words, words to leave out or fields.
export const hasQuery = (q: Query): boolean => !!(q.text || q.not.length || q.terms.length)

// Whether one of the folded texts holds the plain words and none holds a
// word after a "-".
export function hasText(q: Query, ...texts: string[]): boolean {
  if (q.text && !texts.some((t) => t.includes(q.text))) return false
  return !q.not.some((w) => texts.some((t) => t.includes(w)))
}

// How to read a song's fields. Text comes folded (fold); a song's genres
// as one text with "\n" between them.
export interface SongFields<T> {
  text(t: T, f: TextField): string
  // the year (0 or undefined: unknown), plays (0 for none), the last play
  // and when its album was added (ms; undefined: never, unknown)
  num(t: T, f: NumField | TimeField): number | undefined
  loved(t: T): boolean
}

// codec names as files say them; what people type
const codecNames: Record<string, string[]> = {
  mp3: ['layer 3'],
  wav: ['pcm'],
  ape: ["monkey's audio"]
}

// A test for one song: all terms hold. `now` is for the times.
export function songTest<T>(
  terms: readonly Term[],
  of: SongFields<T>,
  now = Date.now()
): (t: T) => boolean {
  const tests = terms.map((term): ((t: T) => boolean) => {
    const test = termTest(term, of, now)
    return term.not ? (t) => !test(t) : test
  })
  if (tests.length === 1) return tests[0]
  return (t) => tests.every((test) => test(t))
}

function termTest<T>(term: Term, of: SongFields<T>, now: number): (t: T) => boolean {
  switch (term.field) {
    case 'loved':
      return (t) => of.loved(t)
    case 'year':
    case 'plays': {
      const { field, min, max } = term
      return (t) => {
        const n = of.num(t, field)
        // an unknown year is no year
        if (n === undefined || (field === 'year' && !n)) return false
        return n >= min && n <= max
      }
    }
    case 'played':
    case 'added': {
      const { field, newer } = term
      const at = now - term.ago
      return (t) => {
        const n = of.num(t, field)
        if (!n) return false
        return newer ? n >= at : n < at
      }
    }
    default: {
      const { field, text } = term
      const also = field === 'codec' ? (codecNames[text] ?? []) : []
      return (t) => {
        const v = of.text(t, field)
        return v.includes(text) || also.some((a) => v.includes(a))
      }
    }
  }
}

// The terms an item answers by its own name (an artist for artist:, a
// genre for genre:), and the rest its songs answer.
export function splitTerms(terms: readonly Term[], own: TextField): { own: Term[]; songs: Term[] } {
  return {
    own: terms.filter((t) => t.field === own),
    songs: terms.filter((t) => t.field !== own)
  }
}

// An item's own name as the only field it has: for the terms splitTerms
// gives it.
export const nameFields = <T>(name: (x: T) => string): SongFields<T> => ({
  text: name,
  num: () => undefined,
  loved: () => false
})

// The "?" next to the search box: each field with one example.
export const fieldHelp: readonly { example: string; text: string }[] = [
  { example: 'artist:vale', text: 'Artist' },
  { example: 'album:"night bus"', text: 'Album, a phrase in quotes' },
  { example: 'title:intro', text: 'Song title' },
  { example: 'genre:metal', text: 'Genre' },
  { example: 'codec:flac', text: 'Format: flac, mp3, opus' },
  { example: 'year:1990-1999', text: 'Year, or year:>2000, year:<1980' },
  { example: 'plays:0', text: 'Times played, or plays:>10' },
  { example: 'played:>1y', text: 'Last played over a year ago' },
  { example: 'added:<30d', text: 'Added in the last 30 days (d, w, m, y)' },
  { example: 'is:loved', text: 'Loved songs' },
  { example: '-genre:pop', text: 'A "-" leaves out what matches' }
]
