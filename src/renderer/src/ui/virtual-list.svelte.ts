// One place for the virtual lists (song table, cover grid, queue).
import {
  createVirtualizer,
  type SvelteVirtualizer,
  type VirtualItem
} from '@tanstack/svelte-virtual'
import { untrack } from 'svelte'
import { watchOffset } from './list-offset'

export interface VirtualListOptions {
  count: number
  // the element that scrolls; may arrive after mount when a parent binds it
  scrollEl: HTMLElement | null | undefined
  // the element the rows sit in, to find where it starts in the scroll box
  list: HTMLElement | undefined
  // row height, or a first guess when rows are measured
  size: number
  // measure rows again, for rows whose height depends on the width
  remeasure?: boolean
}

export interface VirtualList {
  // rows to draw, never past the current count
  readonly items: VirtualItem[]
  readonly total: number
  offset(item: VirtualItem): number
  measure(node: Element): void
  scrollToIndex(index: number): void
}

// Call during component setup. `opts` is read inside an effect, so it tracks state.
export function virtualList(opts: () => VirtualListOptions, overscan = 8): VirtualList {
  const store = createVirtualizer<HTMLElement, Element>({
    count: 0,
    getScrollElement: () => null,
    estimateSize: () => 0,
    overscan
  })
  let v!: SvelteVirtualizer<HTMLElement, Element>
  // the store sends the same object each time, so count changes by hand
  let version = $state(0)
  const stop = store.subscribe((inst) => {
    v = inst
    version++
  })
  // an effect's return value runs when the component goes away
  $effect(() => stop)

  // Where the rows start in the scroll box; the header above them can change height.
  let margin = $state(0)
  const listEl = $derived(opts().list)
  const boxEl = $derived(opts().scrollEl)
  $effect(() => {
    if (!listEl || !boxEl) return
    return watchOffset(listEl, boxEl, (m) => (margin = m))
  })

  // Rows are measured again only when the width changed their size. Not on a
  // new count: a scan adds rows every few seconds, and the rows above the
  // screen would fall back to the guess and move what is shown.
  let measuredAt: number | undefined

  // .pre: update the count before the rows are drawn
  $effect.pre(() => {
    const o = opts()
    const el = o.scrollEl ?? null
    const m = margin
    untrack(() => {
      v.setOptions({
        count: o.count,
        estimateSize: () => o.size,
        scrollMargin: m,
        getScrollElement: () => el
      })
      if (o.remeasure && o.size !== measuredAt) v.measure()
      measuredAt = o.size
    })
  })

  return {
    get items() {
      void version
      // an item left over from a longer list would point past the end
      const n = opts().count
      return v.getVirtualItems().filter((i) => i.index < n)
    },
    get total() {
      void version
      return v.getTotalSize()
    },
    offset: (item) => item.start - v.options.scrollMargin,
    measure: (node) => v.measureElement(node),
    scrollToIndex: (index) => v.scrollToIndex(index, { align: 'start' })
  }
}
