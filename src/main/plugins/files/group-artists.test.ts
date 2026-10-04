import { describe, expect, it } from 'vitest'
import { buildLibrary } from './group'
import { emptyIndex } from './merge'
import type { FileEntry } from './types'
import {
  agreed,
  chunksOf,
  pairsOf,
  shownName,
  splitList,
  taskNames,
  UnionFind,
  userText,
  type TaskName
} from './group-artists'

let nextFile = 0
// one song on its own album
const song = (artist: string, album: string, more: Partial<FileEntry> = {}): FileEntry => {
  const path = `/m/${album}/${nextFile++}.mp3`
  return { path, mtime: 1, size: 1, duration: 60, artist, album, title: `${album} song`, ...more }
}

function names(
  files: FileEntry[],
  overrides: Record<string, string[]> = {},
  groups: Record<string, string> = {}
): TaskName[] {
  const ix = emptyIndex()
  for (const f of files) ix.files.set(f.path, f)
  const { data } = buildLibrary(
    ix,
    () => true,
    new Map(),
    [],
    new Map(),
    new Map(Object.entries(overrides)),
    new Map(Object.entries(groups))
  )
  return taskNames(data.albums, data.tracks)
}

// plain names for the request and answer tests
const plain = (list: string[]): TaskName[] =>
  list.map((name, i) => ({
    n: i + 1,
    key: name.toLowerCase(),
    name,
    titles: [`${name} album`, `${name} single`],
    count: 1,
    manual: false
  }))

describe('the request', () => {
  it('numbers the names in name order, the same whatever order the files come in', () => {
    const files = [song('Björk', 'Homogenic'), song('Beatles', 'Revolver'), song('Bjork', 'Debut')]
    const a = names(files)
    const b = names([...files].reverse())
    expect(a.map((t) => [t.n, t.name])).toEqual([
      [1, 'Beatles'],
      [2, 'Bjork'],
      [3, 'Björk']
    ])
    expect(b.map((t) => [t.n, t.name])).toEqual(a.map((t) => [t.n, t.name]))
  })

  it('lists the names overrides give, not the tags they replace, and no Various Artists', () => {
    const list = names(
      [
        song('Kino', 'Gruppa krovi'),
        song('Ddt', 'Chto takoe osen'),
        song('Unknown artist', 'Nothing'),
        song('Various Artists', 'Hits'),
        song('A', 'Mix', { albumArtist: 'Various Artists' })
      ],
      { ddt: ['DDT'] }
    )
    expect(list.map((t) => [t.name, t.manual])).toEqual([
      ['A', false],
      ['DDT', true],
      ['Kino', false]
    ])
  })

  it('lists a grouped tag by the tag, not the group name', () => {
    const list = names([song('Bjork', 'Debut'), song('Björk', 'Homogenic')], {}, { bjork: 'Björk' })
    expect(list.map((t) => t.name)).toEqual(['Bjork', 'Björk'])
  })

  it('keeps the most common spelling of a name and two titles, albums first', () => {
    const list = names([
      song('Kino', 'Gruppa krovi'),
      song('KINO', 'Zvezda'),
      song('Kino', 'Nachalnik'),
      song('X', 'Comp', { title: 'Kukushka', albumArtist: 'X', artist: 'Kino' })
    ])
    const kino = list.find((t) => t.key === 'kino')!
    expect(kino.name).toBe('Kino')
    // its own albums, then the song on another artist's album
    expect(kino.titles).toEqual(['Gruppa krovi', 'Nachalnik'])
    // one per album and per song
    expect(kino.count).toBe(7)
  })

  it('writes LIST with one title and CHECK with two, numbered as in the full list', () => {
    const list = plain(['Beatles', 'Björk', 'Bjork'])
    expect(userText(list, [list[2]])).toBe(
      [
        'LIST',
        '1 Beatles | Beatles album',
        '2 Björk | Björk album',
        '3 Bjork | Bjork album',
        'CHECK',
        '3 Bjork | Bjork album; Bjork single'
      ].join('\n')
    )
  })

  it('puts a tag with line breaks on one line', () => {
    const [t] = plain(['A\nB'])
    expect(userText([{ ...t, titles: [] }], [])).toBe('LIST\n1 A B\nCHECK')
  })

  it('checks only names not asked yet, 200 at a time', () => {
    const list = plain(Array.from({ length: 460 }, (_, i) => `N${i}`))
    const asked = new Set(list.slice(0, 10).map((t) => t.key))
    const chunks = chunksOf(list, asked)
    expect(chunks.map((c) => c.length)).toEqual([200, 200, 50])
    expect(chunks[0][0].key).toBe('n10')
    expect(chunksOf(list, new Set(list.map((t) => t.key)))).toEqual([])
  })

  it('splits the LIST into parts of about the same size', () => {
    const list = plain(['A', 'B', 'C', 'D', 'E'])
    expect(splitList(list, 2).map((p) => p.map((t) => t.n))).toEqual([
      [1, 2, 3],
      [4, 5]
    ])
  })
})

describe('the answer', () => {
  const check = new Set([3, 4])
  const list = new Set([1, 2, 3, 4])
  const m = (check: unknown, same: unknown, why: unknown = 'x'): unknown => ({ check, same, why })

  it('keeps pairs of numbers asked about, smaller first, with the reason', () => {
    const json = { matches: [m(3, 2, 'accent'), m(4, 1)] }
    expect(pairsOf(json, check, list)).toEqual(
      new Map([
        ['2-3', 'accent'],
        ['1-4', 'x']
      ])
    )
  })

  it('drops a number not in the request, a check not in the chunk, and a name with itself', () => {
    const json = { matches: [m(3, 9), m(2, 1), m(3, 3), m(4, 1)] }
    expect([...pairsOf(json, check, list).keys()]).toEqual(['1-4'])
  })

  it('drops an item of the wrong shape, not the whole answer', () => {
    const json = { matches: [null, 'x', m('3', 2), m(3.5, 2), m(3, 2, 7), [3, 2]] }
    expect([...pairsOf(json, check, list)]).toEqual([['2-3', '']])
  })

  it('takes nothing from a broken answer', () => {
    for (const json of [undefined, null, 'text', [], { matches: 'x' }, { other: [] }])
      expect(pairsOf(json, check, list).size).toBe(0)
  })

  it('keeps only pairs both answers gave, whichever way round', () => {
    const a = pairsOf({ matches: [m(3, 2, 'a'), m(4, 1, 'a')] }, check, list)
    const b = pairsOf({ matches: [m(3, 2, 'b'), m(4, 3, 'b')] }, check, list)
    expect(agreed(a, b)).toEqual(new Map([['2-3', 'a']]))
  })
})

describe('groups', () => {
  it('joins pairs that share a name into one group', () => {
    const uf = new UnionFind()
    uf.addPair('2-3')
    uf.addPair('2-17')
    uf.addPair('5-6')
    expect(uf.groups().sort((a, b) => a[0] - b[0])).toEqual([
      [2, 3, 17],
      [5, 6]
    ])
  })

  it('shows the spelling seen most often, the first on a tie', () => {
    const [a, b, c] = plain(['Bjork', 'Björk', 'BJORK'])
    expect(shownName([a, { ...b, count: 3 }, c])).toBe('Björk')
    expect(shownName([a, b, c])).toBe('Bjork')
  })

  it('shows the name a manual override gives, however rare', () => {
    const [a, b] = plain(['Beatles', 'The Beatles'])
    expect(
      shownName([
        { ...a, count: 9 },
        { ...b, manual: true }
      ])
    ).toBe('The Beatles')
  })
})
