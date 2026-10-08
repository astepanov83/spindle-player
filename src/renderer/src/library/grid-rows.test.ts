import { describe, expect, it } from 'vitest'
import { gridLayout, gridPlaces, type GridRow } from './grid-rows'
import { groupRuns, type Grouping } from './groups'
import { heldMove } from './views'

// items named by their group: 'a1' is in group a
const byFirst: Grouping<string> = { heading: (x) => ({ key: x[0], title: x[0].toUpperCase() }) }
const id = (x: string): string => x

const show = (rows: GridRow<string>[]): string[] =>
  rows.map((r) => ('head' in r ? `# ${r.head.title}` : r.items.join(' ')))

describe('gridLayout', () => {
  it('plain rows without groups', () => {
    const l = gridLayout(['a', 'b', 'c', 'd', 'e'], 2)
    expect(show(l.rows)).toEqual(['a b', 'c d', 'e'])
    expect(l.rowOf(4)).toBe(2)
    expect(l.headsBefore(3)).toBe(0)
  })

  it('a heading row where a group starts, its tiles cut into rows', () => {
    const items = ['a1', 'a2', 'a3', 'b1', 'c1', 'c2']
    const l = gridLayout(items, 2, groupRuns(items, byFirst))
    expect(show(l.rows)).toEqual(['# A', 'a1 a2', 'a3', '# B', 'b1', '# C', 'c1 c2'])
    expect(items.map((_, i) => l.rowOf(i))).toEqual([1, 1, 2, 4, 6, 6])
    expect([0, 1, 3, 4, 5, 6, 7].map((r) => l.headsBefore(r))).toEqual([0, 1, 1, 2, 2, 3, 3])
    const tiles = l.rows[1]
    expect('items' in tiles && tiles.start).toBe(0)
  })
})

describe('gridPlaces', () => {
  const items = ['a1', 'a2', 'a3', 'b1', 'c1', 'c2']
  // headings 50px, tile rows 200px
  const places = (list: string[], cols = 2): ReturnType<typeof gridPlaces> =>
    gridPlaces(gridLayout(list, cols, groupRuns(list, byFirst)), list.length, 50, 200)

  it('tops count the heading rows above', () => {
    const p = places(items)
    expect(items.map((_, i) => p.top(i))).toEqual([50, 50, 250, 500, 750, 750])
    expect(p.height).toBe(950)
  })

  it('the item at a height; a heading gives the item under it', () => {
    const p = places(items)
    expect(p.at(0)).toBe(0)
    expect(p.at(260)).toBe(2)
    expect(p.at(460)).toBe(3)
    expect(p.at(510)).toBe(3)
    expect(p.at(5000)).toBe(4)
  })

  it('keeps the screen still when a scan adds a group and albums above', () => {
    // "c1" was first on screen; an album came in a and one in b, which
    // still fit their rows
    const next = ['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'c1', 'c2']
    const move = heldMove(items, next, 4, 2, id, places(items), places(next))
    expect(move).toEqual({ px: 0, held: 'c1' })
    const more = ['a0', 'a1', 'a2', 'a3', 'a4', 'b0', 'b1', 'b2', 'bb', 'c1', 'c2']
    // a gets a third row and b a second: two rows more above c1
    expect(heldMove(items, more, 4, 2, id, places(items), places(more))).toEqual({
      px: 400,
      held: 'c1'
    })
    // a new group above: its heading and one row
    const group = ['_0', ...items]
    expect(heldMove(items, group, 4, 2, id, places(items), places(group))).toEqual({
      px: 250,
      held: 'c1'
    })
  })
})
