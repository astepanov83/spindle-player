import { describe, expect, it } from 'vitest'
import type { Album } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'
import { sortAlbums } from '../plugins/files/album-sort'
import { listArtists } from '../../../shared/plugins/files/artists'
import {
  addedHeading,
  albumGrouping,
  artistGrouping,
  groupRuns,
  letterOf,
  shortRelease,
  stripLetters,
  yearHeading,
  type Run
} from './groups'

const album = (id: string, o: Partial<Album> = {}): Album => ({
  id,
  title: id,
  artist: 'A',
  year: 0,
  added: 0,
  palette: defaultPalettes,
  cover: '',
  coverLarge: '',
  trackIds: [],
  ...o
})

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// names in many scripts, with accents, digits, symbols and "The"
const names = [
  'Abba',
  'ábc',
  'Æon',
  'Émile',
  'Zed',
  'Þorn',
  'Øre',
  'Łódź',
  'ßtraße',
  'The Beatles',
  'the cure',
  'Thelonious',
  '1999',
  '10cc',
  '"Heroes"',
  '(What)',
  '',
  '😀 smile',
  'Ⅻ Twelve',
  'Ｆｕｌｌ',
  'Άλφα',
  'Αλφα',
  'Ωmega',
  'Ежи',
  'Ёлка',
  'Ель',
  'Иван',
  'Йод',
  'Кино',
  'Яблоко',
  'かえる',
  'カメ',
  'ガラス',
  'ｶﾞﾗｽ',
  'きつね',
  'ゃや',
  '日本',
  '日の出',
  '本',
  '中',
  '가나',
  '각',
  '까치',
  'نور',
  'שלום'
]

// every heading is one run: its key never comes back after another
function oneRunEach(runs: Run[]): void {
  const keys = runs.map((r) => r.heading.key)
  expect(new Set(keys).size).toBe(keys.length)
  for (const k of keys) expect(k).not.toContain('~')
}

describe('letterOf', () => {
  it('Latin letters without accents, "#" before A', () => {
    expect(letterOf('Abba')).toBe('A')
    expect(letterOf('ábc')).toBe('A')
    expect(letterOf('Émile')).toBe('E')
    expect(letterOf('Øre')).toBe('O')
    expect(letterOf('Ｆｕｌｌ')).toBe('F')
    expect(letterOf('1999')).toBe('#')
    expect(letterOf('"Heroes"')).toBe('#')
    expect(letterOf('😀 smile')).toBe('#')
    expect(letterOf('')).toBe('#')
  })

  it('keeps "The", as the sorts do', () => {
    expect(letterOf('The Beatles')).toBe('T')
    expect(letterOf('the cure')).toBe('T')
  })

  it('Cyrillic, Ё under Е and Й under И', () => {
    expect(letterOf('Ёлка')).toBe('Е')
    expect(letterOf('Ежи')).toBe('Е')
    expect(letterOf('Йод')).toBe('И')
    expect(letterOf('Яблоко')).toBe('Я')
  })

  it('Greek without accents', () => {
    expect(letterOf('Άλφα')).toBe('Α')
    expect(letterOf('Ωmega')).toBe('Ω')
  })

  it('kana per kana, katakana and voiced under the hiragana', () => {
    expect(letterOf('かえる')).toBe('か')
    expect(letterOf('カメ')).toBe('か')
    expect(letterOf('ガラス')).toBe('か')
    expect(letterOf('ｶﾞﾗｽ')).toBe('か')
    expect(letterOf('ゃや')).toBe('や')
  })

  it('a kanji, or a letter of another script, is its own heading', () => {
    expect(letterOf('日本')).toBe('日')
    expect(letterOf('本')).toBe('本')
    expect(letterOf('نور')).toBe('ن')
  })

  it('Hangul by its first consonant', () => {
    expect(letterOf('가나')).toBe('ㄱ')
    expect(letterOf('각')).toBe('ㄱ')
    expect(letterOf('까치')).toBe('ㄲ')
  })
})

describe('groupRuns', () => {
  it('artists by letter: each one run, in the sort of listArtists', () => {
    // the real list, so a change to its sort shows here
    const artists = listArtists(
      names.filter(Boolean).map((n, i) => album(`a${i}`, { artist: n })),
      () => {
        throw new Error('no songs')
      }
    )
    const runs = groupRuns(artists, artistGrouping)
    oneRunEach(runs)
    expect(runs[0]).toEqual({
      heading: { key: 'letter:#', title: '#', letter: '#' },
      start: 0,
      end: 5
    })
    const titles = runs.map((r) => r.heading.title)
    expect(titles.slice(0, 4)).toEqual(['#', 'A', 'E', 'F'])
    expect(titles).toContain('Е')
    expect(titles).toContain('か')
    // every item is under one heading
    expect(runs.at(-1)!.end).toBe(artists.length)
  })

  it('albums by Name, from the same title the sort compares', () => {
    const albums = sortAlbums(
      names.map((t, i) => album(`a${i}`, { title: t })),
      'name',
      () => undefined
    )
    oneRunEach(groupRuns(albums, albumGrouping('name', 0)!))
  })

  it('albums by Artist: one heading per album artist, case and accents as the sort has them', () => {
    // library order: artist, year, title (main's group.ts)
    const albums = [
      album('a', { artist: 'ABBA', year: 1975 }),
      album('b', { artist: 'Abba', year: 1976 }),
      album('c', { artist: 'ABBA', year: 1977 }),
      album('d', { artist: 'Björk', year: 1993 }),
      album('e', { artist: 'Bjork', year: 1995 }),
      album('f', { artist: 'The Cure', year: 1980 })
    ]
    const runs = groupRuns(albums, albumGrouping('artist', 0)!)
    oneRunEach(runs)
    expect(runs.map((r) => [r.heading.title, r.heading.letter, r.start, r.end])).toEqual([
      ['ABBA', 'A', 0, 3],
      ['Björk', 'B', 3, 5],
      ['The Cure', 'T', 5, 6]
    ])
    expect(runs[0].heading.artist).toBe('ABBA')
  })

  it('albums by Year: decades, no year last', () => {
    const albums = sortAlbums(
      [1999, 0, 2021, 2020, 1990, 2005, 0].map((year, i) => album(`a${i}`, { year })),
      'year',
      () => undefined
    )
    const runs = groupRuns(albums, albumGrouping('year', 0)!)
    oneRunEach(runs)
    expect(runs.map((r) => [r.heading.title, r.end - r.start])).toEqual([
      ['2020s', 2],
      ['2000s', 1],
      ['1990s', 2],
      ['No year', 2]
    ])
    expect(runs.every((r) => r.heading.letter === undefined)).toBe(true)
  })

  it('no groups for the play sorts', () => {
    expect(albumGrouping('played', 0)).toBeUndefined()
    expect(albumGrouping('plays', 0)).toBeUndefined()
  })

  it('a key that comes back gets its own key, so rows never share one', () => {
    const runs = groupRuns(['a', 'b', 'a'], {
      heading: (x) => ({ key: x, title: x }),
      same: (x, y) => x === y
    })
    expect(runs.map((r) => r.heading.key)).toEqual(['a', 'b', 'a~2'])
  })
})

describe('headings', () => {
  it('decades', () => {
    expect(yearHeading(2024)).toEqual({ key: 'year:2020', title: '2020s' })
    expect(yearHeading(1990)).toEqual({ key: 'year:1990', title: '1990s' })
    expect(yearHeading(0)).toEqual({ key: 'year:none', title: 'No year' })
  })

  const at = (y: number, m: number, d: number): number => new Date(y, m - 1, d, 12).getTime()

  it('added: this week, this month, earlier this year, then years', () => {
    const now = at(2026, 10, 20)
    const t = (ms: number): string => addedHeading(ms, now).title
    expect(t(at(2026, 10, 15))).toBe('This week')
    expect(t(at(2026, 10, 2))).toBe('This month')
    expect(t(at(2026, 3, 1))).toBe('Earlier this year')
    expect(t(at(2025, 12, 31))).toBe('2025')
    expect(t(at(2019, 6, 1))).toBe('2019')
    expect(t(0)).toBe('No date')
  })

  it('added around a year change: each group is one run', () => {
    const now = at(2026, 1, 3)
    const days = [0, 1, 2, 5, 6, 8, 20, 40, 400, 800]
    const albums = sortAlbums(
      [...days.map((n, i) => album(`a${i}`, { added: now - n * 86400000 })), album('z')],
      'added',
      () => undefined
    )
    const runs = groupRuns(albums, albumGrouping('added', now)!)
    oneRunEach(runs)
    expect(runs.map((r) => [r.heading.title, r.end - r.start])).toEqual([
      ['This week', 5],
      ['2025', 3],
      ['2024', 1],
      ['2023', 1],
      ['No date', 1]
    ])
  })

  it('added early in a month: this week reaches into last month', () => {
    const now = at(2026, 6, 2)
    const albums = sortAlbums(
      [0, 3, 10, 40].map((n, i) => album(`a${i}`, { added: now - n * 86400000 })),
      'added',
      () => undefined
    )
    const runs = groupRuns(albums, albumGrouping('added', now)!)
    oneRunEach(runs)
    expect(runs.map((r) => r.heading.title)).toEqual(['This week', 'Earlier this year'])
  })
})

describe('stripLetters', () => {
  it('# and A-Z always, the empty ones off, then the other letters in order', () => {
    const artists = ['Abba', 'Zed', '1999', 'Кино', 'かえる'].map((name) => ({ name }))
    artists.sort((a, b) => collator.compare(a.name, b.name))
    const strip = stripLetters(groupRuns(artists, artistGrouping))
    expect(strip.slice(0, 27).map((s) => s.letter)).toEqual(['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'])
    expect(strip.filter((s) => s.has).map((s) => s.letter)).toEqual(['#', 'A', 'Z', 'К', 'か'])
  })
})

describe('shortRelease (099)', () => {
  const release = (title: string, songs: number): Pick<Album, 'title' | 'trackIds'> => ({
    title,
    trackIds: Array.from({ length: songs }, (_, i) => `t${i}`)
  })

  it('takes 6 songs or fewer', () => {
    expect(shortRelease(release('Rain Days', 1))).toBe(true)
    expect(shortRelease(release('Rain Days', 6))).toBe(true)
    expect(shortRelease(release('Rain Days', 7))).toBe(false)
  })

  it('takes a longer one whose title says EP or single, as a word in any case', () => {
    expect(shortRelease(release('Small Hours EP', 9))).toBe(true)
    expect(shortRelease(release('Night Drive (Single)', 8))).toBe(true)
    expect(shortRelease(release('the ep', 8))).toBe(true)
    // part of another word is not it
    expect(shortRelease(release('Deep Singles Collection', 12))).toBe(false)
    expect(shortRelease(release('Epic', 10))).toBe(false)
  })
})
