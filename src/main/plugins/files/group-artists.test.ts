import { describe, expect, it } from 'vitest'
import { buildLibrary } from './group'
import { emptyIndex } from './merge'
import type { FileEntry } from './types'
import { artistKey } from '../../../shared/plugins/files/artists'
import { convertOld, resolve, yourKeys } from '../../../shared/plugins/files/artists-file'
import {
  agreed,
  agreedSplits,
  chunksOf,
  joinNames,
  joinSystem,
  pairsOf,
  sameParts,
  shownName,
  splitList,
  splitsOf,
  splitSystem,
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
  // artists.json as the old files would make it, with the AI on
  const tags = files.flatMap((f) => [f.artist, f.albumArtist]).filter((t) => t !== undefined)
  const spelling = (key: string): string | undefined => tags.find((t) => artistKey(t) === key)
  const old = { groups: new Map(Object.entries(groups)), asked: new Set<string>() }
  const f = convertOld(new Map(Object.entries(overrides)), old, spelling).artists
  const { data } = buildLibrary(ix, () => true, new Map(), [], new Map(), resolve(f, true))
  return taskNames(data.albums, data.tracks, yourKeys(f))
}

// plain names for the request and answer tests
const plain = (list: string[]): TaskName[] =>
  list.map((name, i) => ({
    n: i + 1,
    key: name.toLowerCase(),
    name,
    titles: [`${name} album`, `${name} single`],
    count: 1,
    seen: i,
    manual: false
  }))

describe('the request', () => {
  // every CHECK name is in LIST too, so a model left alone pairs each name
  // with itself (seen on the user's library); the code drops those pairs
  it('tells the model to pick a different line and leave out names with no match', () => {
    expect(joinSystem).toContain('find a different line in LIST')
    expect(joinSystem).toContain('Never answer a line with its own number.')
    expect(joinSystem).toContain('Leave out lines with no match.')
  })

  it('asks the split as the ticket words it, written as in the tag', () => {
    expect(splitSystem).toContain('list the real artists the tag names, each written as in the tag')
    expect(splitSystem).toContain('Leave out lines that already name exactly one artist')
  })

  // ticket 070: the prompt never names an artist, not even as an example
  it('names no artist in either prompt', () => {
    const cases = [
      'Sadness',
      'Forgotten',
      'Soulless',
      'In Autumnus',
      'Grief & Bliss',
      'Grief',
      'Bliss',
      'A Perfect Day',
      'City Of Dawn',
      'An Open Letter',
      'Jared Turner',
      'John Pasden',
      'kenopsia',
      'Moonspell',
      'Orquestra Sinfonietta De Lisboa',
      'Charles Dickens',
      'Xingxing Liu',
      'Jules Verne',
      'Falaise',
      'Crescent Days',
      'Shishuang Chen',
      'Centerpointe',
      'Centrepointe',
      'Centerpointe Research Institute',
      'Mortiis',
      "Last Man's Breath",
      'The Evocation of Her Tears',
      'Bill Harris',
      'Morbid God',
      'Magogaio',
      'Stellafera',
      // the old prompt's examples
      'Bjork',
      'Björk',
      'Beatles',
      'Guns N',
      'Kino',
      'Кино',
      'Electric Light Orchestra',
      'ELO',
      'Drake',
      'Rihanna',
      'Bush'
    ]
    for (const prompt of [splitSystem, joinSystem])
      for (const name of cases) expect(prompt.toLowerCase()).not.toContain(name.toLowerCase())
  })

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

  it('lists the names you gave, not the tags they replace, and no Various Artists', () => {
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

  it('lists a tag you kept as its own name (Use tag) as a name you gave', () => {
    const list = names([song('Kino', 'Gruppa krovi'), song('Ddt', 'Osen')], { kino: ['Kino'] })
    expect(list.map((t) => [t.name, t.manual])).toEqual([
      ['Ddt', false],
      ['Kino', true]
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
    // "Kino" itself: one per album and per song
    expect(kino.count).toBe(5)
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

  it('compares single spellings, not the totals of each name', () => {
    // "Bjork" x3 and "BJORK" x3 are one name (6 in all), "Björk" x5 another
    const files = [
      ...['A', 'B', 'C'].map((a) => song('Bjork', a)),
      ...['D', 'E', 'F'].map((a) => song('BJORK', a)),
      ...['G', 'H', 'I', 'J', 'K'].map((a) => song('Björk', a))
    ].map((f, i) => ({ ...f, title: `t${i}` }))
    expect(shownName(names(files))).toBe('Björk')
  })

  it('shows the first seen of two spellings as common as each other', () => {
    const list = names([song('Björk', 'A'), song('Bjork', 'B')])
    expect(list.map((t) => t.name)).toEqual(['Bjork', 'Björk'])
    expect(shownName(list)).toBe('Björk')
  })

  it('shows the spelling seen most often, the first on a tie', () => {
    const [a, b, c] = plain(['Bjork', 'Björk', 'BJORK'])
    expect(shownName([a, { ...b, count: 3 }, c])).toBe('Björk')
    expect(shownName([a, b, c])).toBe('Bjork')
  })

  it('shows a name you gave, however rare', () => {
    const [a, b] = plain(['Beatles', 'The Beatles'])
    expect(
      shownName([
        { ...a, count: 9 },
        { ...b, manual: true }
      ])
    ).toBe('The Beatles')
  })
})

describe('the split answer', () => {
  const tags = plain(['Sadness, Forgotten', 'Grief & Bliss', 'Magogaio', 'A/B/C'])
  const t = (check: unknown, artists: unknown, why: unknown = 'joint'): unknown => ({
    check,
    artists,
    why
  })
  const kept = (json: unknown): Record<number, string[]> =>
    Object.fromEntries([...splitsOf(json, tags).splits].map(([n, s]) => [n, s.parts]))

  it('keeps the parts as written, trimmed, with their keys sorted and the reason', () => {
    const { splits, dropped } = splitsOf({ tags: [t(1, [' Sadness', 'Forgotten '])] }, tags)
    expect(splits.get(1)).toEqual({
      parts: ['Sadness', 'Forgotten'],
      keys: ['forgotten', 'sadness'],
      why: 'joint'
    })
    expect(dropped).toEqual([])
  })

  it('keeps one part: the tag with extra words around one name', () => {
    expect(kept({ tags: [t(4, ['B'])] })).toEqual({ 4: ['B'] })
  })

  it('drops each bad item with a reason, and keeps the rest', () => {
    const long = 'x'.repeat(201)
    const twentyOne = Array.from({ length: 21 }, () => 'A')
    const json = {
      tags: [
        null,
        t(9, ['A']),
        t('1', ['Sadness']),
        t(2, 'Grief'),
        t(2, ['Grief', 7]),
        t(2, []),
        t(2, ['Grief', ' ']),
        t(2, ['Grief', long]),
        // a name from an album title, not the tag
        t(3, ['Magogaio', 'Sadness']),
        t(2, ['Grief', 'grief']),
        t(3, ['magogaio']),
        t(4, twentyOne),
        t(1, ['Sadness', 'Forgotten'], 7),
        t(1, ['Sadness'])
      ]
    }
    const { splits, dropped } = splitsOf(json, tags)
    expect([...splits]).toEqual([
      [1, { parts: ['Sadness', 'Forgotten'], keys: ['forgotten', 'sadness'], why: '' }]
    ])
    expect(dropped).toEqual([
      'an item that is not an object',
      'line 9: not a CHECK line',
      'line "1": not a CHECK line',
      'Grief & Bliss: artists is not a list of names',
      'Grief & Bliss: artists is not a list of names',
      'Grief & Bliss: no parts',
      'Grief & Bliss: an empty part',
      'Grief & Bliss: a part is too long',
      'Magogaio: "Sadness" is not in the tag',
      'Grief & Bliss: "grief" twice',
      'Magogaio: one part, the tag itself',
      'A/B/C: more than 20 parts',
      'Sadness, Forgotten: answered twice'
    ])
  })

  it('finds a part in the tag with case ignored', () => {
    expect(kept({ tags: [t(1, ['SADNESS', 'forgotten'])] })).toEqual({
      1: ['SADNESS', 'forgotten']
    })
  })

  it('takes nothing from a broken answer', () => {
    for (const json of [undefined, null, 'text', [], { tags: 'x' }, { matches: [] }])
      expect(splitsOf(json, tags).splits.size).toBe(0)
  })

  describe('two answers', () => {
    const of = (items: unknown[]): ReturnType<typeof splitsOf>['splits'] =>
      splitsOf({ tags: items }, tags).splits

    it('keep a split with the same parts in another order, as the first wrote it', () => {
      const a = of([t(1, ['Sadness', 'Forgotten'], 'a')])
      const b = of([t(1, ['forgotten', 'SADNESS'], 'b')])
      expect(sameParts(a.get(1)!, b.get(1)!)).toBe(true)
      expect(agreedSplits(a, b)).toEqual(a)
    })

    it('drop a split with other parts, or one part missing, or one answer without it', () => {
      const a = of([t(4, ['A', 'B', 'C']), t(1, ['Sadness', 'Forgotten'])])
      const b = of([t(4, ['A', 'B'])])
      expect(sameParts(a.get(4)!, b.get(4)!)).toBe(false)
      expect(agreedSplits(a, b).size).toBe(0)
      const c = of([t(4, ['C', 'A', 'B']), t(1, ['Sadness', 'Forgot'])])
      expect([...agreedSplits(a, c).keys()]).toEqual([4])
    })
  })
})

describe('the join names', () => {
  it('takes a split tag out and brings its parts in with its titles, numbered anew', () => {
    const list = plain(['Zed', 'Sadness, Forgotten', 'Abba'])
    const out = joinNames(list, new Map([['sadness, forgotten', ['Sadness', 'Forgotten']]]))
    expect(out.map((t) => [t.n, t.name, t.key, t.titles, t.manual])).toEqual([
      [1, 'Abba', 'abba', ['Abba album', 'Abba single'], false],
      [
        2,
        'Forgotten',
        'forgotten',
        ['Sadness, Forgotten album', 'Sadness, Forgotten single'],
        false
      ],
      [3, 'Sadness', 'sadness', ['Sadness, Forgotten album', 'Sadness, Forgotten single'], false],
      [4, 'Zed', 'zed', ['Zed album', 'Zed single'], false]
    ])
    // the step 1 numbers stay as they were
    expect(list.map((t) => t.n)).toEqual([1, 2, 3])
  })

  it('makes a part with the key of a name already there that name', () => {
    const list = plain(['sadness', 'Sadness, Forgotten', 'Forgotten, Sadness'])
    const out = joinNames(
      list,
      new Map([
        ['sadness, forgotten', ['Sadness', 'Forgotten']],
        ['forgotten, sadness', ['Sadness', 'Forgotten']]
      ])
    )
    expect(out.map((t) => [t.name, t.titles[0]])).toEqual([
      ['Forgotten', 'Sadness, Forgotten album'],
      ['sadness', 'sadness album']
    ])
  })

  it('keeps a name you gave whose key is in the splits: only tags are split', () => {
    const [you] = plain(['Kino'])
    const out = joinNames([{ ...you, manual: true }], new Map([['kino', ['A', 'B']]]))
    expect(out.map((t) => t.name)).toEqual(['Kino'])
  })
})
