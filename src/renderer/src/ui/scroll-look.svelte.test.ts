// A new look of the same view starts at the item the old look showed first
// (ticket 095), also for a place kept in another look.
import { flushSync } from 'svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Album, LibraryData } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'
import { library } from '../stores/library.svelte'
import { setViewLook } from '../stores/settings.svelte'
import { files } from '../plugins/files/store.svelte'
import { addFinder } from './item-finder'
import { libraryView, scrollTopOnChange } from './scroll-top.svelte'

// radio's page half hears main from the start; before the imports load it
vi.hoisted(() =>
  vi.stubGlobal('window', {
    radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
  })
)

const ids = Array.from({ length: 20 }, (_, i) => `a${i}`)

const album = (id: string): Album => ({
  id,
  title: id,
  artist: 'X',
  year: 0,
  added: 0,
  palette: defaultPalettes,
  cover: '',
  coverLarge: '',
  trackIds: []
})

const lib: LibraryData = { albums: ids.map(album), tracks: [], folders: [] }

// Where item i's top is in the page: two 100px tiles a row under a 200px head
// in the grid, 30px rows in the list. Only items near the screen are drawn.
const tops = {
  grid: (i: number) => 200 + Math.floor(i / 2) * 100,
  list: (i: number) => 200 + i * 30
}
const heights = { grid: 100, list: 30 }

// the list's column heads stuck at the box's top, when the test asks
let heads = false
const stuckHeads = { getBoundingClientRect: () => ({ top: 0, bottom: 38 }) }

describe('a new look of the view (ticket 095)', () => {
  let frames: (() => void)[] = []
  let look: 'grid' | 'list' = 'grid'
  let box: HTMLElement | undefined = $state.raw()
  let cleanup = (): void => {}

  // a 300px box over 2000px of page
  function makeBox(): HTMLElement {
    const drawn = (i: number): boolean => Math.abs(tops[look](i) - el.scrollTop) < 400
    const item = (
      i: number
    ): { dataset: { item: string }; getBoundingClientRect: () => object } => ({
      dataset: { item: `album/a${i}` },
      getBoundingClientRect: () => ({
        top: tops[look](i) - el.scrollTop,
        bottom: tops[look](i) + heights[look] - el.scrollTop
      })
    })
    const el = {
      scrollTop: 0,
      scrollHeight: 2000,
      clientHeight: 300,
      getBoundingClientRect: () => ({ top: 0, bottom: 300, height: 300 }),
      querySelectorAll: (q: string) =>
        q === '[data-item]'
          ? ids
              .map((_, i) => i)
              .filter(drawn)
              .map(item)
          : q === '[data-sticky-top]' && heads && look === 'list'
            ? [stuckHeads]
            : [],
      querySelector: (q: string) => {
        const i = ids.findIndex((id) => q === `[data-item="album/${id}"]`)
        return i >= 0 && drawn(i) ? item(i) : null
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    }
    return el as unknown as HTMLElement
  }

  // a tick, then a frame at a time, until the scroll is done
  async function settle(): Promise<void> {
    for (let i = 0; i < 80; i++) {
      await Promise.resolve()
      const run = frames
      frames = []
      run.forEach((f) => f())
    }
  }

  // the old look's rows are still drawn when the view hears of the new one
  async function switchTo(l: 'grid' | 'list'): Promise<void> {
    setViewLook('albums', l)
    flushSync()
    look = l
    await settle()
  }

  beforeEach(async () => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => frames.push(f))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('CSS', { escape: (s: string) => s })
    vi.stubGlobal('getComputedStyle', () => ({ paddingTop: '0px', top: '0px' }))
    heads = false
    files.load(lib)
    look = 'grid'
    setViewLook('albums', 'grid')
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

  it('names the look in the view', () => {
    expect(libraryView().look).toBe('grid')
    library.openPage('albums', 'album/a1')
    expect(libraryView().look).toBeUndefined()
  })

  it('keeps the first item on screen where it was', async () => {
    // the head shows: a0 and a1's row (y 200) is the first on screen, 50px down
    box!.scrollTop = 150
    await switchTo('list')
    // a0's list row is at 200: 50px down again
    expect(box!.scrollTop).toBe(150)
    // a8 and a9's row (y 600) is the first on screen, at the top
    await switchTo('grid')
    box!.scrollTop = 600
    await switchTo('list')
    // a8's list row is at 440
    expect(box!.scrollTop).toBe(440)
  })

  it('shows the item in full at the top when it was partly above it', async () => {
    // a8's 100px tile is 50px above the top; its 30px list row would be out of view
    box!.scrollTop = 650
    await switchTo('list')
    expect(box!.scrollTop).toBe(440)
    // and back: the same item, now at the top
    await switchTo('grid')
    expect(box!.scrollTop).toBe(600)
  })

  it('stays at the top when it was there', async () => {
    await switchTo('list')
    expect(box!.scrollTop).toBe(0)
  })

  it('puts the item under the parts stuck at the top of the new look, in full', async () => {
    heads = true
    // a8 is 10px above the top in the grid; in the list it would be under the 38px heads
    box!.scrollTop = 610
    await switchTo('list')
    // a8's list row (440) lands just under the heads
    expect(box!.scrollTop).toBe(402)
    // more than half out of view: at the top, which is under the heads too
    await switchTo('grid')
    box!.scrollTop = 650
    await switchTo('list')
    expect(box!.scrollTop).toBe(402)
    // back to the grid: a7, under the heads, is not the first on screen, so
    // a8 stays first, 38px down as in the list
    await switchTo('grid')
    expect(box!.scrollTop).toBe(562)
  })

  it('asks the list for an item it has not drawn yet', async () => {
    box!.scrollTop = 1150
    // a18's grid row (y 1100) is first; its list row at 740 is not drawn at 1150
    const stop = addFinder((key) => (key === 'album/a18' ? 740 : undefined))
    await switchTo('list')
    stop()
    // 50px above the top would hide its 30px row: at the top
    expect(box!.scrollTop).toBe(740)
  })

  it('starts a place kept in another look at its item', async () => {
    box!.scrollTop = 650
    library.openPage('albums', 'album/a8')
    flushSync()
    await settle()
    expect(box!.scrollTop).toBe(0)
    // Settings changes the look while the album is open
    look = 'list'
    setViewLook('albums', 'list')
    library.back()
    flushSync()
    await settle()
    expect(box!.scrollTop).toBe(440)
  })
})
