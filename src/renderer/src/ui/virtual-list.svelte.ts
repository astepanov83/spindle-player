// One place for the virtual lists (song table, cover grid, queue).
import {
  createVirtualizer,
  type SvelteVirtualizer,
  type VirtualItem
} from '@tanstack/svelte-virtual'
import { untrack } from 'svelte'

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
  $effect(() => stop)

  // .pre: update the count before the rows are drawn
  $effect.pre(() => {
    const o = opts()
    const margin = o.list?.offsetTop ?? 0
    const el = o.scrollEl ?? null
    untrack(() => {
      v.setOptions({
        count: o.count,
        estimateSize: () => o.size,
        scrollMargin: margin,
        getScrollElement: () => el
      })
      if (o.remeasure) v.measure()
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
