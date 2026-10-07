// Selecting several rows of a list (ticket 086): Ctrl+click, Shift+click,
// Shift+arrows, Ctrl+A, Esc. Plain functions over a list of row ids in the
// order shown. A song list's ids are item keys, so a new sort keeps what is
// selected; the queue's are row numbers, since a song can be in it twice.

// What the order is read from. An array works; so does a range of numbers.
export interface Rows<T> {
  readonly length: number
  at(i: number): T | undefined
  // -1 when the id is not shown
  indexOf(id: T): number
}

export interface Selection<T> {
  ids: ReadonlySet<T>
  // where a Shift range starts: the row last clicked without Shift
  anchor: T | undefined
}

export interface Mods {
  ctrl: boolean
  shift: boolean
}

export const noneSelected = <T>(anchor?: T): Selection<T> => ({ ids: new Set(), anchor })

// Rows `a` to `b` either way round.
function range<T>(rows: Rows<T>, a: number, b: number): T[] {
  const out: T[] = []
  const end = Math.min(Math.max(a, b), rows.length - 1)
  for (let i = Math.max(0, Math.min(a, b)); i <= end; i++) out.push(rows.at(i) as T)
  return out
}

// Where the anchor is, else `from` (no anchor, or it is no longer shown).
function anchorAt<T>(p: Selection<T>, rows: Rows<T>, from: number): number {
  const a = p.anchor === undefined ? -1 : rows.indexOf(p.anchor)
  return a < 0 ? from : a
}

// A click on row `i`. A plain one selects nothing (the row plays) but leaves
// the anchor there, so a Shift+click after it selects from the song clicked.
// Ctrl adds or takes out one row; Shift selects from the anchor to the row,
// and with Ctrl adds that to what is selected.
export function clickSelect<T>(p: Selection<T>, rows: Rows<T>, i: number, m: Mods): Selection<T> {
  const id = rows.at(i) as T
  if (m.shift) {
    const a = anchorAt(p, rows, i)
    const ids = new Set(m.ctrl ? p.ids : [])
    for (const r of range(rows, a, i)) ids.add(r)
    return { ids, anchor: rows.at(a) }
  }
  if (!m.ctrl) return noneSelected(id)
  const ids = new Set(p.ids)
  if (ids.has(id)) ids.delete(id)
  else ids.add(id)
  return { ids, anchor: id }
}

// Shift+Up, Shift+Down (and Page Up, Home...) moved the focus from row
// `from` to row `to`: the rows from the anchor to `to` are selected. With
// nothing selected, the range starts at the row that had focus.
export function stepSelect<T>(
  p: Selection<T>,
  rows: Rows<T>,
  from: number,
  to: number
): Selection<T> {
  const a = p.ids.size ? anchorAt(p, rows, from) : from
  return { ids: new Set(range(rows, a, to)), anchor: rows.at(a) }
}

// Ctrl+A: every row shown.
export function selectAll<T>(p: Selection<T>, rows: Rows<T>): Selection<T> {
  return { ids: new Set(range(rows, 0, rows.length - 1)), anchor: p.anchor }
}

// Just these rows, the anchor kept: Ctrl+A in one part of the rows.
export function selectOnly<T>(p: Selection<T>, ids: readonly T[]): Selection<T> {
  return { ids: new Set(ids), anchor: p.anchor }
}

// The rows shown changed (a search, rows taken out): what is no longer
// shown is no longer selected. The same object when nothing went.
export function keepShown<T>(p: Selection<T>, rows: Rows<T>): Selection<T> {
  if (!p.ids.size) return p
  const ids = new Set([...p.ids].filter((id) => rows.indexOf(id) >= 0))
  const anchor = p.anchor !== undefined && rows.indexOf(p.anchor) >= 0 ? p.anchor : undefined
  return ids.size === p.ids.size && anchor === p.anchor ? p : { ids, anchor }
}

// The rows were put in a new order (`order[j]` is the old row now at j):
// the same rows stay selected at their new numbers. For the queue, whose
// ids are row numbers.
export function movedSelection(p: Selection<number>, order: readonly number[]): Selection<number> {
  if (!p.ids.size && p.anchor === undefined) return p
  const place: number[] = []
  order.forEach((old, j) => (place[old] = j))
  const ids = new Set([...p.ids].map((r) => place[r]).filter((r) => r !== undefined))
  return { ids, anchor: p.anchor === undefined ? undefined : place[p.anchor] }
}

// The selected rows in the order shown.
export function selectedInOrder<T>(p: Selection<T>, rows: Rows<T>): T[] {
  return [...p.ids]
    .map((id) => [id, rows.indexOf(id)] as const)
    .filter(([, i]) => i >= 0)
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)
}

// A right-click on row `i`: on a selected row the menu is for every selected
// row; on another, for that row alone, and the rest are no longer selected,
// so what looks selected is what the menu acts on.
export function menuSelect<T>(
  p: Selection<T>,
  rows: Rows<T>,
  i: number
): { selected: Selection<T>; ids: T[] } {
  const id = rows.at(i) as T
  if (p.ids.has(id)) return { selected: p, ids: selectedInOrder(p, rows) }
  return { selected: p.ids.size ? noneSelected(id) : p, ids: [id] }
}

// An array as Rows. indexOf builds a map on first use, so a 50k-song table
// answers it at once.
export function listRows<T>(list: readonly T[]): Rows<T> {
  let at: Map<T, number> | undefined
  return {
    length: list.length,
    at: (i) => list[i],
    indexOf(id) {
      if (!at) {
        at = new Map()
        // the first place of an id, as Array.indexOf
        for (let i = list.length - 1; i >= 0; i--) at.set(list[i], i)
      }
      return at.get(id) ?? -1
    }
  }
}

// Row numbers 0 to `count - 1`: the queue's rows, which select by place
// since a song can be in it twice.
export function numberRows(count: number): Rows<number> {
  return {
    length: count,
    at: (i) => (i >= 0 && i < count ? i : undefined),
    indexOf: (n) => (n >= 0 && n < count && Number.isInteger(n) ? n : -1)
  }
}
