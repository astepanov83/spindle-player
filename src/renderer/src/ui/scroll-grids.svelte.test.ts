// Back to a page with several grids, each with rows numbered from 0 (an
// artist page's Albums and Appears on): the place is put back by its item,
// not by a row number that both grids have.
import { flushSync } from 'svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { library } from '../stores/library.svelte'
import { libraryView, scrollTopOnChange } from './scroll-top.svelte'

// radio's page half hears main from the start; before the imports load it
vi.hoisted(() =>
  vi.stubGlobal('window', {
    radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
  })
)

// Two square grids of two 100px rows, two tiles a row: the first at 0, the
// second under a 100px heading at 300. All rows are drawn.
const grids = [
  { top: 0, items: ['a0', 'a1', 'a2', 'a3'] },
  { top: 300, items: ['a4', 'a5', 'a6', 'a7'] }
]

describe('Back to a page with two grids', () => {
  let frames: (() => void)[] = []
  let box: HTMLElement | undefined = $state.raw()
  let cleanup = (): void => {}

  function makeBox(): HTMLElement {
    const rect = (top: number): object => ({
      top: top - el.scrollTop,
      bottom: top + 100 - el.scrollTop
    })
    const grid = { dataset: { grid: 'square' } }
    const rows = grids.flatMap((g) =>
      [0, 1].map((i) => ({
        dataset: { index: String(i) },
        closest: () => grid,
        getBoundingClientRect: () => rect(g.top + i * 100)
      }))
    )
    const items = grids.flatMap((g) =>
      g.items.map((id, i) => ({
        dataset: { item: `album/${id}` },
        getBoundingClientRect: () => rect(g.top + Math.floor(i / 2) * 100)
      }))
    )
    const el = {
      scrollTop: 0,
      scrollHeight: 1000,
      clientHeight: 300,
      getBoundingClientRect: () => ({ top: 0, bottom: 300, height: 300 }),
      querySelectorAll: (q: string) =>
        q === '[data-item]'
          ? items
          : q === '[data-index]' || q === '[data-grid="square"] > [data-index]'
            ? rows
            : [],
      querySelector: (q: string) => items.find((r) => q === `[data-item="${r.dataset.item}"]`),
      addEventListener: () => {},
      removeEventListener: () => {}
    }
    return el as unknown as HTMLElement
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 80; i++) {
      await Promise.resolve()
      const run = frames
      frames = []
      run.forEach((f) => f())
    }
  }

  beforeEach(async () => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => frames.push(f))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('CSS', { escape: (s: string) => s })
    vi.stubGlobal('getComputedStyle', () => ({ paddingTop: '0px', top: '0px' }))
    library.openPage('albums', '')
    box = makeBox()
    cleanup()
    cleanup = $effect.root(() =>
      scrollTopOnChange(
        () => box,
        () => libraryView()
      )
    )
    flushSync()
    await settle()
  })

  it('returns to the item in the second grid, not row 0 of the first', async () => {
    // a6's row (y 400) is the first on screen, 30px above the top
    box!.scrollTop = 430
    library.openPage('albums', 'album/a6')
    flushSync()
    await settle()
    expect(box!.scrollTop).toBe(0)
    library.back()
    flushSync()
    await settle()
    expect(box!.scrollTop).toBe(430)
  })
})
