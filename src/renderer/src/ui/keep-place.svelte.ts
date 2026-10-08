// Keeps the first row on screen in its place when a scan adds songs or albums
// above it (ticket 022). Only for changes from the library: a new sort or a
// search moves the view as before. A list scrolled to the top stays there,
// so new songs show. Call during component setup.
import { tick, untrack } from 'svelte'
import { evenPlaces, heldMove, type ItemPlaces } from '../library/views'

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
  // where a list's items are when its rows differ in height (a grid with
  // headings); else rows of `per` items, `rowSize` px each
  places?: (items: T[]) => ItemPlaces
  // changes with every library the page gets (or new data in a plugin)
  source: number | string
}

export function keepPlace<T>(opts: () => PlaceOptions<T>): void {
  let last: { items: T[]; source: number | string } | undefined
  // the item held in place last time, and where the view was left; while it
  // stays there, the next change holds the same item
  let held: { key: string; scroll: number } | undefined
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
      if (listTop >= 0) {
        held = undefined
        return
      }
      const places = o.places ?? ((items: T[]) => evenPlaces(items.length, o.per, o.rowSize))
      const before = places(prev.items)
      let from = before.at(-listTop)
      if (held && Math.abs(box.scrollTop - held.scroll) < 1) {
        const k = held.key
        const i = prev.items.findIndex((x) => o.key(x) === k)
        if (i >= 0 && before.top(i) === before.top(from)) from = i
      }
      const { px, held: key } = heldMove(
        prev.items,
        o.items,
        from,
        o.per,
        o.key,
        before,
        places(o.items)
      )
      // after the list has its new height, or the box can't scroll that far
      void tick().then(() => {
        if (px) box.scrollTop += px
        held = key === undefined ? undefined : { key, scroll: box.scrollTop }
      })
    })
  })
}
