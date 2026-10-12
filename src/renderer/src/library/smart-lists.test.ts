import { describe, expect, it } from 'vitest'
import type { Plays } from '../../../shared/plays'
import type { ItemKey } from '../../../shared/plugins/items'
import {
  dayOf,
  heldRows,
  sameRows,
  smartItems,
  smartList,
  smartLists,
  smartRules,
  type SmartData,
  type SmartSong
} from './smart-lists'

const day = 24 * 60 * 60 * 1000
const now = new Date(2026, 9, 13, 15, 0).getTime()
const k = (id: string): ItemKey => `files:${id}` as ItemKey

const song = (id: string, added = 0): SmartSong => ({ key: k(id), added })
const data = (o: Partial<SmartData>): SmartData => ({
  songs: [],
  plays: {},
  loved: {},
  now,
  ...o
})
const played = (list: [string, number, number][]): Plays =>
  Object.fromEntries(list.map(([id, n, last]) => [k(id), { n, last }]))

describe('the lists (ticket 118)', () => {
  it('has five, each with a name, an icon and why it is empty', () => {
    expect(smartLists.map((l) => l.id)).toEqual(['loved', 'most', 'forgotten', 'added', 'never'])
    for (const l of smartLists) expect(l.name && l.icon && l.empty && l.about).toBeTruthy()
    expect(smartList('loved')?.empty).toMatch(/^Love a song to see it here/)
    expect(smartList('nope')).toBeUndefined()
  })
})

describe('Loved', () => {
  it('is the loved songs, newest first; ties keep library order', () => {
    const songs = ['a', 'b', 'c', 'd'].map((id) => song(id))
    const loved = { [k('a')]: 10, [k('c')]: 30, [k('d')]: 10 }
    expect(smartItems('loved', data({ songs, loved }))).toEqual([k('c'), k('a'), k('d')])
  })

  it('leaves out hearts of songs not in the library', () => {
    const loved = { [k('a')]: 10, [k('gone')]: 20 }
    expect(smartItems('loved', data({ songs: [song('a')], loved }))).toEqual([k('a')])
  })
})

describe('Most played', () => {
  it('is the most played first, a tie to the one played last', () => {
    const songs = ['a', 'b', 'c', 'd'].map((id) => song(id))
    const plays = played([
      ['a', 2, 100],
      ['b', 7, 50],
      ['c', 2, 300]
    ])
    expect(smartItems('most', data({ songs, plays }))).toEqual([k('b'), k('c'), k('a')])
  })

  it(`keeps only the first ${smartRules.mostPlayed}`, () => {
    const songs = Array.from({ length: 150 }, (_, i) => song(`s${i}`))
    const plays = played(songs.map((_, i) => [`s${i}`, i + 1, 0]))
    const list = smartItems('most', data({ songs, plays }))
    expect(list).toHaveLength(100)
    expect(list[0]).toBe(k('s149'))
    expect(list[99]).toBe(k('s50'))
  })

  it('leaves out plays of songs not in the library', () => {
    const plays = played([
      ['gone', 9, 0],
      ['a', 1, 0]
    ])
    expect(smartItems('most', data({ songs: [song('a')], plays }))).toEqual([k('a')])
  })
})

describe('Forgotten favorites', () => {
  const edge = now - smartRules.forgottenAfter

  it('is played 5 times or more and not in the last 6 months, most played first', () => {
    const songs = ['a', 'b', 'c', 'd', 'e'].map((id) => song(id))
    const plays = played([
      ['a', 5, edge],
      ['b', 4, edge - day],
      ['c', 9, edge + 1],
      ['d', 12, edge - 400 * day],
      ['e', 6, 0]
    ])
    expect(smartItems('forgotten', data({ songs, plays }))).toEqual([k('d'), k('e'), k('a')])
  })

  it('the edges: 5 plays counts, 4 does not; 6 months ago counts, a moment later does not', () => {
    const songs = [song('a'), song('b')]
    const at = (n: number, last: number): string[] =>
      smartItems(
        'forgotten',
        data({
          songs,
          plays: played([
            ['a', n, last],
            ['b', 1, now]
          ])
        })
      )
    expect(at(5, edge)).toEqual([k('a')])
    expect(at(4, edge)).toEqual([])
    expect(at(5, edge + 1)).toEqual([])
    expect(smartRules.forgottenAfter).toBe(183 * day)
  })
})

describe('Recently added', () => {
  const edge = now - smartRules.addedWithin

  it('is the songs of albums added in the last 30 days, newest album first, each in album order', () => {
    const songs = [
      song('a1', now - 2 * day),
      song('a2', now - 2 * day),
      song('b1', now - day),
      song('old', edge - 1),
      song('unknown', 0),
      song('b2', now - day)
    ]
    expect(smartItems('added', data({ songs }))).toEqual([k('b1'), k('b2'), k('a1'), k('a2')])
  })

  it('the edge: 30 days ago counts, a moment before does not', () => {
    expect(smartItems('added', data({ songs: [song('a', edge)] }))).toEqual([k('a')])
    expect(smartItems('added', data({ songs: [song('a', edge - 1)] }))).toEqual([])
    expect(smartRules.addedWithin).toBe(30 * day)
  })
})

describe('Never played', () => {
  const songs = Array.from({ length: 40 }, (_, i) => song(`s${i}`))

  it('is every song with no plays', () => {
    const plays = played([
      ['s1', 1, 0],
      ['s2', 3, 0]
    ])
    const list = smartItems('never', data({ songs, plays }))
    expect(list).toHaveLength(38)
    expect(list).not.toContain(k('s1'))
    expect(new Set(list).size).toBe(38)
  })

  it('keeps one order all day, and picks a new one the next day', () => {
    const at = (t: number): ItemKey[] => smartItems('never', data({ songs, now: t }))
    const morning = new Date(2026, 9, 13, 0, 0, 1).getTime()
    const night = new Date(2026, 9, 13, 23, 59, 59).getTime()
    const next = new Date(2026, 9, 14, 0, 0, 1).getTime()
    expect(at(night)).toEqual(at(morning))
    expect(at(next)).not.toEqual(at(morning))
    // shuffled, not library order
    expect(at(morning)).not.toEqual(songs.map((s) => s.key))
  })

  it('a song played leaves without moving the others', () => {
    const before = smartItems('never', data({ songs }))
    const after = smartItems('never', data({ songs, plays: played([['s7', 1, now]]) }))
    expect(after).toEqual(before.filter((x) => x !== k('s7')))
  })

  it('days are local dates', () => {
    expect(dayOf(new Date(2026, 0, 2, 23, 0).getTime())).toBe('2026-1-2')
  })
})

describe('an open list (read only)', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(k)

  it('keeps its rows while the list changes, until Refresh', () => {
    const held = [a, b, c]
    const rows = heldRows(held, [d, c, a, b], () => true)
    expect(rows).toBe(held)
    expect(sameRows(rows, [d, c, a, b])).toBe(false)
  })

  it('drops at once only the songs that may not stay (gone, or unloved in Loved)', () => {
    expect(heldRows([a, b, c], [a, c], (x) => x !== b)).toEqual([a, c])
  })

  it('shows the list as it is when nothing was shown', () => {
    expect(heldRows([], [b, a], () => true)).toEqual([b, a])
  })

  it('a list is never changed in place', () => {
    const songs = [song('a'), song('b')]
    const plays = played([['a', 3, now]])
    const d1 = data({ songs, plays })
    const list = smartItems('most', d1)
    list.push(k('b'))
    expect(smartItems('most', d1)).toEqual([k('a')])
    expect(songs.map((s) => s.key)).toEqual([k('a'), k('b')])
  })

  it('sameRows', () => {
    expect(sameRows([a, b], [a, b])).toBe(true)
    expect(sameRows([a, b], [b, a])).toBe(false)
    expect(sameRows([a], [a, b])).toBe(false)
  })
})
