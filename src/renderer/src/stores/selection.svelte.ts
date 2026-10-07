// The selected rows of a song list (ticket 086), and which list has them.
// Only one list has a selection at a time: selecting in another list clears
// the first, so `selection.songs` is always what looks selected.
import { untrack } from 'svelte'
import type { ItemKey } from '../../../shared/plugins/items'
import {
  clickSelect,
  keepShown,
  menuSelect,
  noneSelected,
  selectAll,
  selectedInOrder,
  selectOnly,
  stepSelect,
  type Rows,
  type Selection
} from '../ui/selection'

export class RowSelection<T> {
  s: Selection<T> = $state.raw(noneSelected())

  constructor(
    readonly rows: () => Rows<T>,
    // the songs of rows `ids`: a song list's ids are its songs
    readonly songsOf: (ids: T[]) => ItemKey[]
  ) {}

  has(id: T): boolean {
    return this.s.ids.has(id)
  }

  get size(): number {
    return this.s.ids.size
  }

  set(s: Selection<T>): void {
    if (s === this.s) return
    this.s = s
    if (s.ids.size) selection.take(this as RowSelection<unknown>)
    else if (selection.list === this) selection.list = null
  }

  // A row click. True when Ctrl or Shift was held: it selected, and the row
  // must not play.
  click(i: number, e: Pick<MouseEvent, 'ctrlKey' | 'shiftKey'>): boolean {
    this.set(clickSelect(this.s, this.rows(), i, { ctrl: e.ctrlKey, shift: e.shiftKey }))
    return e.ctrlKey || e.shiftKey
  }

  step(from: number, to: number): void {
    this.set(stepSelect(this.s, this.rows(), from, to))
  }

  all(): void {
    this.set(selectAll(this.s, this.rows()))
  }

  // Ctrl+A in a part of the rows (one group of search results).
  only(ids: T[]): void {
    this.set(selectOnly(this.s, ids))
  }

  // Esc: true when something was selected, so the key is used up.
  clear(): boolean {
    if (!this.s.ids.size) return false
    this.set(noneSelected(this.s.anchor))
    return true
  }

  // The rows a right-click on row `i` acts on.
  menu(i: number): T[] {
    const m = menuSelect(this.s, this.rows(), i)
    this.set(m.selected)
    return m.ids
  }

  // The selected rows, in the order shown.
  ids(): T[] {
    return selectedInOrder(this.s, this.rows())
  }

  songs(): ItemKey[] {
    return this.songsOf(this.ids())
  }

  // Rows that are no longer shown are no longer selected.
  keepShown(): void {
    this.set(keepShown(this.s, this.rows()))
  }
}

class SelectionStore {
  // the list with selected rows, if any
  list: RowSelection<unknown> | null = $state.raw(null)

  take(l: RowSelection<unknown>): void {
    const was = this.list
    this.list = l
    if (was && was !== l) was.clear()
  }

  // The selected songs, in the order shown: for whatever acts on them from
  // outside the list (drag and drop, ticket 089).
  get songs(): ItemKey[] {
    return this.list?.songs() ?? []
  }
}

export const selection = new SelectionStore()

// A list's selection, for a component's script: it follows the rows shown,
// and goes when the list does. `rows` must give the same object until the
// rows change, since a new one is checked for rows that went.
export function rowSelection<T>(
  rows: () => Rows<T>,
  songsOf: (ids: T[]) => ItemKey[]
): RowSelection<T> {
  const r = new RowSelection(rows, songsOf)
  $effect(() => {
    rows()
    untrack(() => r.keepShown())
  })
  $effect(() => () => untrack(() => r.clear()))
  return r
}
