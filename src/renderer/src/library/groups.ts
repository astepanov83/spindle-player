// Headings over runs of albums or artists (ticket 096): letters, an album
// artist, decades, when added. The grid, the list and the shelves all use
// these. Each heading comes from what the sort compares, so a group is one
// run and never shows twice. No DOM, no store.
import type { Album } from '../../../shared/library'

export interface Heading {
  // the same for every item under it, and different from the other headings
  key: string
  title: string
  // the A-Z strip's entry, for letters and artists: '#', 'A', 'Б', 'か', '日'
  letter?: string
  // an album artist's heading: the name as the albums carry it
  artist?: string
}

// How a sorted list falls into groups.
export interface Grouping<T> {
  heading: (x: T) => Heading
  // whether two neighbours go under one heading, where the key can't say
  // it: the sort's own compare (an album artist), so a group never splits.
  // Without it, the same key is the same heading.
  same?: (a: T, b: T) => boolean
}

// A heading and its items: items[start] up to items[end - 1].
export interface Run {
  heading: Heading
  start: number
  end: number
}

// The same compare as the sorts (album-sort.ts, shared/plugins/files/artists.ts).
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function groupRuns<T>(items: readonly T[], g: Grouping<T>): Run[] {
  const runs: Run[] = []
  const keys = new Set<string>()
  // each item's heading is asked once: 50k albums in a big library
  let key: string | undefined
  for (let i = 0; i < items.length; i++) {
    const same = g.same
    let heading = same ? undefined : g.heading(items[i])
    const last = runs[runs.length - 1]
    if (last && (same ? same(items[i - 1], items[i]) : heading!.key === key)) {
      last.end = i + 1
      continue
    }
    heading ??= g.heading(items[i])
    key = heading.key
    // never two rows with one key: an album artist's key could come back
    // for a name the sort tells apart, or main's sort in another language
    if (keys.has(heading.key)) heading = { ...heading, key: `${heading.key}~${i}` }
    keys.add(heading.key)
    runs.push({ heading, start: i, end: i + 1 })
  }
  return runs
}

// Where a script's letters start. The headings are the spans between them
// in the sort's own order, so whatever the language sorts first, a letter's
// names sit in one run. Accents go with their letter as the sort has them
// (É under E, Ё under Е); Й sits between И and К, so under И.
interface Start {
  at: string
  title: string
  script: string
}

const latin = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
const starts = (script: string, letters: string, titles = letters): Start[] =>
  [...letters].map((at, i) => ({ at, title: [...titles][i], script }))

// Katakana (and halfwidth) sort with their hiragana and voicing marks don't
// count, so ガ goes under か. Hangul by its first consonant.
const allStarts: Start[] = [
  ...starts('Latin', latin.join('')),
  ...starts('Greek', 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'),
  ...starts('Cyrillic', 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'),
  ...starts(
    'Kana',
    'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'
  ),
  ...starts(
    'Hangul',
    '가까나다따라마바빠사싸아자짜차카타파하',
    'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
  )
]

let sortedStarts: Start[] | undefined
function ordered(): Start[] {
  if (!sortedStarts) {
    const out = [...allStarts].sort((a, b) => collator.compare(a.at, b.at))
    // a language that sorts two letters as one keeps the first
    sortedStarts = out.filter((s, i) => i === 0 || collator.compare(out[i - 1].at, s.at) !== 0)
  }
  return sortedStarts
}

const scripts: [string, RegExp][] = [
  ['Latin', /\p{Script=Latin}/u],
  ['Greek', /\p{Script=Greek}/u],
  ['Cyrillic', /\p{Script=Cyrillic}/u],
  ['Kana', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ['Hangul', /\p{Script=Hangul}/u]
]
const scriptOf = (ch: string): string | undefined => scripts.find(([, re]) => re.test(ch))?.[0]

// The letter heading of a name, as the Name sort and the Artists list sort it.
// Before the first letter (digits, symbols, nothing) is "#". A letter of
// another script (a kanji, Arabic) is its own heading.
export function letterOf(name: string): string {
  let l = letters.get(name)
  if (l === undefined) {
    // names change little from one scan to the next
    if (letters.size > 100_000) letters.clear()
    letters.set(name, (l = findLetter(name)))
  }
  return l
}

const letters = new Map<string, string>()

function findLetter(name: string): string {
  const list = ordered()
  // the last start at or before the name
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (collator.compare(list[mid].at, name) <= 0) lo = mid + 1
    else hi = mid
  }
  if (lo === 0) return '#'
  const start = list[lo - 1]
  const first = [...name.normalize('NFKC')][0] ?? ''
  if (/\p{L}/u.test(first) && scriptOf(first) !== start.script) return first.toUpperCase()
  return start.title
}

const letterHeading = (name: string): Heading => {
  const letter = letterOf(name)
  return { key: `letter:${letter}`, title: letter, letter }
}

// Artists, as listArtists sorts them: by name.
export const artistGrouping: Grouping<{ name: string }> = {
  heading: (a) => letterHeading(a.name)
}

const day = 24 * 3600 * 1000

// Newest first: the last 7 days, this month, this year, then each year.
// Each span starts before the one above it ends, so a group is one run also
// in the first days of a month or a year.
export function addedHeading(ms: number, now: number): Heading {
  if (!ms) return { key: 'added:none', title: 'No date' }
  const d = new Date(now)
  if (ms >= now - 7 * day) return { key: 'added:week', title: 'This week' }
  if (ms >= new Date(d.getFullYear(), d.getMonth(), 1).getTime())
    return { key: 'added:month', title: 'This month' }
  if (ms >= new Date(d.getFullYear(), 0, 1).getTime())
    return { key: 'added:year', title: 'Earlier this year' }
  const y = new Date(ms).getFullYear()
  return { key: `added:${y}`, title: String(y) }
}

export function yearHeading(year: number): Heading {
  if (!year) return { key: 'year:none', title: 'No year' }
  const decade = Math.floor(year / 10) * 10
  return { key: `year:${decade}`, title: `${decade}s` }
}

// The Albums sort's groups (name, artist, year, added); none for the play
// sorts, whose order is the point. `now` places Recently added.
export function albumGrouping(by: string, now: number): Grouping<Album> | undefined {
  if (by === 'name') return { heading: (al) => letterHeading(al.title) }
  if (by === 'year') return { heading: (al) => yearHeading(al.year) }
  if (by === 'added') return { heading: (al) => addedHeading(al.added, now) }
  if (by === 'artist')
    return {
      // the key only names the row; `same` makes the runs
      heading: (al) => ({
        key: `artist:${al.artist.normalize('NFKD').toLowerCase()}`,
        title: al.artist,
        letter: letterOf(al.artist),
        artist: al.artist
      }),
      same: (a, b) => collator.compare(a.artist, b.artist) === 0
    }
  return undefined
}

// The A-Z strip (ticket 096): "#" and A-Z always, then the other letters
// the headings have, in their order. `has` says which have a heading.
export function stripLetters(runs: readonly Run[]): { letter: string; has: boolean }[] {
  const seen = new Set<string>()
  for (const r of runs) if (r.heading.letter) seen.add(r.heading.letter)
  const always = ['#', ...latin]
  return [
    ...always.map((letter) => ({ letter, has: seen.has(letter) })),
    ...[...seen].filter((l) => !always.includes(l)).map((letter) => ({ letter, has: true }))
  ]
}
