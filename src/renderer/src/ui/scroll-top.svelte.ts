// A new view in a library area starts at the top; going back up, Back,
// Forward and another chip return to where the view was left (see scroll-places.ts).
import { tick, untrack } from 'svelte'
import { ScrollPlaces, type View } from './scroll-places'
import { findItem } from './item-finder'
import { coveredTop } from './sticky-top'
import { pageLook, pagePath } from '../plugins'
import { library } from '../stores/library.svelte'

// The open view, as a path for ScrollPlaces: the tab, then where its page
// is under it (the page's plugin says).
export function libraryView(): View {
  const tab = library.tab
  const look = pageLook(tab)
  return {
    path: [tab, ...pagePath(tab)],
    query: library.query.trim(),
    ...(look ? { look } : {})
  }
}

// Where a view was left: its scrollTop, and the first grid row on screen
// with its offset from the box's top. Rows above it that were never drawn
// again come back at their guessed height, so the pixels alone drift a few
// px per row; the row puts the place back exactly.
interface Place {
  top: number
  row?: { grid: string; index: string; y: number }
  // a song row (data-song) to show in the middle, when it is drawn (ticket 040)
  song?: string
  // The look the view was drawn in, and its first item on screen (data-item)
  // with its offset from the box's top. Another look has other rows, so it
  // starts at that item (ticket 095).
  look?: string
  item?: { key: string; y: number }
  // the item was first on screen in another look
  relooked?: boolean
}

// Grid rows carry data-index inside a data-grid, "square" or "round"
// (blocks/Tiles.svelte). A
// view has one of each at most: the search results have both, so a row is
// looked up in its own grid.
const rows = (el: HTMLElement, grid?: string): NodeListOf<HTMLElement> =>
  el.querySelectorAll<HTMLElement>(grid ? `[data-grid="${grid}"] > [data-index]` : '[data-index]')

function placeOf(el: HTMLElement, look: string | undefined): Place {
  const boxTop = el.getBoundingClientRect().top
  const place: Place = { top: el.scrollTop, ...(look ? { look } : {}) }
  // an item hidden under the column heads or held heading is not on screen
  const clear = boxTop + coveredTop(el)
  for (const r of el.querySelectorAll<HTMLElement>('[data-item]')) {
    const b = r.getBoundingClientRect()
    if (b.bottom <= clear) continue
    place.item = { key: r.dataset.item!, y: b.top - boxTop }
    break
  }
  for (const r of rows(el)) {
    const b = r.getBoundingClientRect()
    if (b.bottom > boxTop)
      return {
        ...place,
        row: {
          grid: r.closest<HTMLElement>('[data-grid]')?.dataset.grid ?? '',
          index: r.dataset.index!,
          y: b.top - boxTop
        }
      }
  }
  return place
}

// A place left in another look: only its first item carries over. At the
// top it stays at the top, with the head in view.
function inLook(p: Place, look: string | undefined): Place {
  if (p.look === look) return p
  return p.item && p.top > 0 ? { top: p.top, item: p.item, relooked: true } : { top: 0 }
}

// Call during component setup: `view` reads whatever picks the view.
// library.landing (a link from what plays, ticket 040) wins over a kept
// place: the top, or a song's row, also when the page was open already.
export function scrollTopOnChange(box: () => HTMLElement | undefined, view: () => View): void {
  const places = new ScrollPlaces<Place>()
  let last: View | undefined
  let stop: (() => void) | undefined
  // .pre: the old view is still drawn, so its place is not cut short yet
  $effect.pre(() => {
    const to = view()
    const landing = library.landing
    // read here so a landing waits for the box to be drawn
    const el = box()
    untrack(() => {
      const here = el ? placeOf(el, last?.look) : { top: 0 }
      const moved = places.move(last, here, to, library.takeReturn())
      // the same view in another look (its switch, or Settings)
      const relooked = moved === undefined && !!last && last.look !== to.look
      last = to
      if (!el) return
      let place: Place
      if (landing) {
        library.landing = null
        place = landing.song ? { top: 0, song: landing.song } : { top: 0 }
      } else if (relooked) place = inLook(here, to.look)
      else if (moved === undefined) return
      else place = moved === 'top' ? { top: 0 } : inLook(moved, to.look)
      stop?.()
      stop = scrollWhenDrawn(el, place)
    })
  })
}

// A virtual list gets its height a frame or two after it is drawn, so the
// place is set again each frame until it holds. Scrolling by hand stops it.
function scrollWhenDrawn(el: HTMLElement, place: Place): () => void {
  let frames = 0
  let held = 0
  let id = 0
  let done = false
  const stop = (): void => {
    done = true
    cancelAnimationFrame(id)
    el.removeEventListener('wheel', stop)
    el.removeEventListener('pointerdown', stop)
    el.removeEventListener('keydown', stop)
  }
  // how far off the place is: by the row once it is drawn, else by pixels
  const off = (): number => {
    const box = el.getBoundingClientRect()
    const song =
      place.song && el.querySelector<HTMLElement>(`[data-song="${CSS.escape(place.song)}"]`)
    if (song) {
      const b = song.getBoundingClientRect()
      return b.top - box.top - (box.height - b.height) / 2
    }
    // in the same look the grid row puts it back, as before
    const item = place.row ? undefined : place.item
    if (item) {
      const r = el.querySelector<HTMLElement>(`[data-item="${CSS.escape(item.key)}"]`)
      if (r) {
        const b = r.getBoundingClientRect()
        if (!place.relooked) return b.top - box.top - item.y
        // In full and never under the new look's column heads or held
        // heading: a tile half above the top would leave a 60px list row out
        // of view, and switching back would keep another item.
        return b.top - box.top - Math.max(item.y, coveredTop(el))
      }
      // not drawn: where its list says its row is
      const at = findItem(item.key)
      if (at !== undefined) return at - el.scrollTop - item.y
    }
    const want = place.row
    const r = want && [...rows(el, want.grid)].find((r) => r.dataset.index === want.index)
    if (!want || !r) return place.top - el.scrollTop
    return r.getBoundingClientRect().top - box.top - want.y
  }
  // A song near the end can't reach the middle: as far as the box scrolls.
  // Not for the other places: a virtual list is still getting its height.
  const miss = (): number => {
    if (!place.song) return off()
    const to = Math.min(Math.max(el.scrollTop + off(), 0), el.scrollHeight - el.clientHeight)
    return to - el.scrollTop
  }
  const step = (): void => {
    if (done) return
    el.scrollTop += miss()
    held = Math.abs(miss()) < 1 ? held + 1 : 0
    if (held >= 3 || ++frames > 60) stop()
    else id = requestAnimationFrame(step)
  }
  el.addEventListener('wheel', stop)
  el.addEventListener('pointerdown', stop)
  el.addEventListener('keydown', stop)
  void tick().then(step)
  return stop
}
