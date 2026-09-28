// Keeps the first row on screen in its place when a scan adds songs or albums
// above it (ticket 022). Only for changes from the library: a new sort or a
// search moves the view as before. A list scrolled to the top stays there,
// so new songs show. Call during component setup.
import { tick, untrack } from 'svelte'
import { placeShift } from '../library/views'

export interface PlaceOptions<T> {
  // the element that scrolls, and the one the rows sit in
  scrollEl: HTMLElement | undefined
  list: HTMLElement | undefined
  items: T[]
  // items in a row: 1 in a table, the columns in a grid
  per: number
  // row height in px
  rowSize: number
  key: (item: T) => string
  // changes with every library the page gets
  source: number
}

export function keepPlace<T>(opts: () => PlaceOptions<T>): void {
  let last: { items: T[]; source: number } | undefined
  // .pre: the old rows are still drawn, so the first one on screen is known
  $effect.pre(() => {
    const o = opts()
    untrack(() => {
      const prev = last
      last = { items: o.items, source: o.source }
      if (!prev || prev.items === o.items || prev.source === o.source) return
      const box = o.scrollEl
      if (!box || !o.list || o.rowSize <= 0) return
      const listTop = o.list.getBoundingClientRect().top - box.getBoundingClientRect().top
      // listTop is negative once the list's top has scrolled past
      if (listTop >= 0) return
      const first = Math.floor(-listTop / o.rowSize)
      const shift = placeShift(prev.items, o.items, first, o.per, o.key)
      // after the list has its new height, or the box can't scroll that far
      if (shift) void tick().then(() => (box.scrollTop += shift * o.rowSize))
    })
  })
}
