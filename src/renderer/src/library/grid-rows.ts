// The rows of a tile grid (blocks/Tiles.svelte): tiles cut into rows of
// `cols`, with a heading row where a group starts (ticket 096). The list
// look (blocks/List.svelte) is the same with one item a row. No DOM.
import type { Heading, Run } from './groups'
import type { ItemPlaces } from './views'

// Heading rows have set heights, so the rows above the screen are known.
export const headSizes = { letter: 52, artist: 76 }

// key: the row's name for the virtual list, which keeps a measured height by
// it. A tile row is named by its group and its place in the group, not by
// its first item, so an album that comes into a group above the screen
// renames no row after it and they keep their heights.
export type GridRow<T> =
  | { key: string; head: Heading; run: Run }
  // start: the index of its first item
  | { key: string; items: T[]; start: number }

export interface GridLayout<T> {
  rows: GridRow<T>[]
  // the row item i is in
  rowOf(i: number): number
  // heading rows before row r
  headsBefore(r: number): number
  // the heading row at or before row r; -1 when there is none
  headOf(r: number): number
}

// Without runs, plain rows as before.
export function gridLayout<T>(
  items: readonly T[],
  cols: number,
  runs?: readonly Run[]
): GridLayout<T> {
  const rows: GridRow<T>[] = []
  const rowOf = new Int32Array(items.length)
  // heading rows before each row, and one more entry for the end
  const heads: number[] = []
  const headAt: number[] = []
  let h = 0
  const cut = (start: number, end: number, group: string): void => {
    for (let i = start, r = 0; i < end; i += cols, r++) {
      const n = Math.min(cols, end - i)
      rowOf.fill(rows.length, i, i + n)
      heads.push(h)
      headAt.push(runs ? rows.length - r - 1 : -1)
      rows.push({ key: `t ${group}${r}`, items: items.slice(i, i + n), start: i })
    }
  }
  if (!runs) cut(0, items.length, '')
  else
    for (const run of runs) {
      heads.push(h++)
      headAt.push(rows.length)
      rows.push({ key: `h ${run.heading.key}`, head: run.heading, run })
      cut(run.start, run.end, `${run.heading.key} `)
    }
  heads.push(h)
  return {
    rows,
    rowOf: (i) => rowOf[i],
    headsBefore: (r) => heads[Math.min(r, rows.length)],
    headOf: (r) => headAt[r] ?? -1
  }
}

// The top of row r in px: heading rows of `headSize`, the others `rowSize`.
export function rowTop<T>(
  layout: GridLayout<T>,
  r: number,
  headSize: number,
  rowSize: number
): number {
  const h = layout.headsBefore(r)
  return h * headSize + (r - h) * rowSize
}

// The first heading row of each letter, for the A-Z strip.
export function letterRows<T>(rows: readonly GridRow<T>[]): Record<string, number> {
  const at: Record<string, number> = {}
  rows.forEach((r, i) => {
    const l = 'head' in r ? r.head.letter : undefined
    if (l !== undefined) at[l] ??= i
  })
  return at
}

// Where the items are in px: heading rows of `headSize`, tile rows of
// `rowSize` (an average; tile rows are measured once drawn).
export function gridPlaces<T>(
  layout: GridLayout<T>,
  count: number,
  headSize: number,
  rowSize: number
): ItemPlaces {
  const { rows } = layout
  const top = (r: number): number => rowTop(layout, r, headSize, rowSize)
  return {
    top: (i) => top(layout.rowOf(i)),
    at: (y) => {
      // the last row starting at or above y
      let lo = 0
      let hi = rows.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (top(mid) <= y) lo = mid + 1
        else hi = mid
      }
      for (let r = Math.max(0, lo - 1); r < rows.length; r++) {
        const row = rows[r]
        if ('items' in row) return row.start
      }
      return count
    },
    height: top(rows.length)
  }
}
