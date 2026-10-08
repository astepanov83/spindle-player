// The rows of a tile grid (blocks/Tiles.svelte): tiles cut into rows of
// `cols`, with a heading row where a group starts (ticket 096). No DOM.
import type { Heading, Run } from './groups'
import type { ItemPlaces } from './views'

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
  let h = 0
  const cut = (start: number, end: number, group: string): void => {
    for (let i = start, r = 0; i < end; i += cols, r++) {
      const n = Math.min(cols, end - i)
      rowOf.fill(rows.length, i, i + n)
      heads.push(h)
      rows.push({ key: `t ${group}${r}`, items: items.slice(i, i + n), start: i })
    }
  }
  if (!runs) cut(0, items.length, '')
  else
    for (const run of runs) {
      heads.push(h++)
      rows.push({ key: `h ${run.heading.key}`, head: run.heading, run })
      cut(run.start, run.end, `${run.heading.key} `)
    }
  heads.push(h)
  return { rows, rowOf: (i) => rowOf[i], headsBefore: (r) => heads[Math.min(r, rows.length)] }
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
  const rowTop = (r: number): number => {
    const h = layout.headsBefore(r)
    return h * headSize + (r - h) * rowSize
  }
  return {
    top: (i) => rowTop(layout.rowOf(i)),
    at: (y) => {
      // the last row starting at or above y
      let lo = 0
      let hi = rows.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (rowTop(mid) <= y) lo = mid + 1
        else hi = mid
      }
      for (let r = Math.max(0, lo - 1); r < rows.length; r++) {
        const row = rows[r]
        if ('items' in row) return row.start
      }
      return count
    },
    height: rowTop(rows.length)
  }
}
