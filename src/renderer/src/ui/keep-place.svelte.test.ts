// keepPlace with rows of different heights (ticket 096): a scan that adds a
// group above the screen moves the view by the heading and rows it added.
import { flushSync, tick } from 'svelte'
import { describe, expect, it } from 'vitest'
import { gridLayout, gridPlaces } from '../library/grid-rows'
import { groupRuns, type Grouping } from '../library/groups'
import { keepPlace } from './keep-place.svelte'

// items named by their group: 'a1' is in group a
const byFirst: Grouping<string> = { heading: (x) => ({ key: x[0], title: x[0] }) }
// headings 50px, tile rows 200px, 2 to a row
const places = (list: string[]): ReturnType<typeof gridPlaces> =>
  gridPlaces(gridLayout(list, 2, groupRuns(list, byFirst)), list.length, 50, 200)

const items = ['a1', 'a2', 'a3', 'b1', 'c1', 'c2']

// a box scrolled to `top`, its list starting 100px into the content
function setup(top: number): {
  box: { scrollTop: number }
  change: (next: string[]) => Promise<void>
  stop: () => void
} {
  const box = { scrollTop: top, getBoundingClientRect: () => ({ top: 0 }) }
  const list = { getBoundingClientRect: () => ({ top: 100 - box.scrollTop }) }
  let shown = $state({ items, source: 1 })
  const stop = $effect.root(() =>
    keepPlace(() => ({
      scrollEl: box as unknown as HTMLElement,
      list: list as unknown as HTMLElement,
      items: shown.items,
      per: 2,
      rowSize: 200,
      key: (x: string) => x,
      places,
      source: shown.source
    }))
  )
  flushSync()
  const change = async (next: string[]): Promise<void> => {
    shown = { items: next, source: shown.source + 1 }
    flushSync()
    await tick()
  }
  return { box, change, stop }
}

describe('keepPlace with heading rows (ticket 096)', () => {
  it('a group added above moves the view by its heading and its row', async () => {
    // 760px into the list: c1's row (it starts at 750)
    const { box, change, stop } = setup(860)
    await change(['_0', ...items])
    expect(box.scrollTop).toBe(860 + 250)
    stop()
  })

  it('albums that fit the rows they came into move nothing', async () => {
    const { box, change, stop } = setup(860)
    await change(['a0', ...items.slice(0, 3), 'b0', ...items.slice(3)])
    expect(box.scrollTop).toBe(860)
    stop()
  })

  it('at the top it stays at the top', async () => {
    const { box, change, stop } = setup(50)
    await change(['_0', ...items])
    expect(box.scrollTop).toBe(50)
    stop()
  })
})
