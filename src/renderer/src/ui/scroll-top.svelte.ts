// A new view in a library area starts at the top; going back up returns to
// where the view was left (see scroll-places.ts).
import { tick, untrack } from 'svelte'
import { ScrollPlaces, type View } from './scroll-places'
import { crumbs, shownFolder } from '../library/folders'
import { library } from '../stores/library.svelte'

// The open view under a section or chip, as a path for ScrollPlaces.
export function libraryView(top: string): View {
  const path = [top]
  if (top === 'albums' && library.open) path.push(`album:${library.open}`)
  if (top === 'playlists' && library.openPlaylist) path.push(`pl:${library.openPlaylist}`)
  if (top === 'folders') {
    const tree = library.folders
    const i = shownFolder(tree, library.folder)
    if (i !== null) for (const j of crumbs(tree, i)) path.push(`folder:${tree.nodes[j].key}`)
  }
  if (top === 'artists') {
    if (library.artist) path.push(`artist:${library.artist}`)
    if (library.open) path.push(`album:${library.open}`)
  }
  // The search results (Albums) and the filtered grid (Artists) show over
  // the open view, so they are a view below it (ticket 039). Other views
  // filter in place and stay the same view.
  if (library.query.trim() && (top === 'albums' || top === 'artists')) {
    path.push('search')
    if (top === 'albums' && library.searchAll) path.push(`all:${library.searchAll}`)
  }
  return { path, query: library.query.trim() }
}

// Where a view was left: its scrollTop, and the first grid row on screen
// with its offset from the box's top. Rows above it that were never drawn
// again come back at their guessed height, so the pixels alone drift a few
// px per row; the row puts the place back exactly.
interface Place {
  top: number
  row?: { grid: string; index: string; y: number }
}

// Grid rows carry data-index inside a data-grid (AlbumGrid, ArtistGrid). A
// view has one of each at most: the search results have both, so a row is
// looked up in its own grid.
const rows = (el: HTMLElement, grid?: string): NodeListOf<HTMLElement> =>
  el.querySelectorAll<HTMLElement>(grid ? `[data-grid="${grid}"] > [data-index]` : '[data-index]')

function placeOf(el: HTMLElement): Place {
  const boxTop = el.getBoundingClientRect().top
  for (const r of rows(el)) {
    const b = r.getBoundingClientRect()
    if (b.bottom > boxTop)
      return {
        top: el.scrollTop,
        row: {
          grid: r.closest<HTMLElement>('[data-grid]')?.dataset.grid ?? '',
          index: r.dataset.index!,
          y: b.top - boxTop
        }
      }
  }
  return { top: el.scrollTop }
}

// Call during component setup: `view` reads whatever picks the view.
export function scrollTopOnChange(box: () => HTMLElement | undefined, view: () => View): void {
  const places = new ScrollPlaces<Place>()
  let last: View | undefined
  let stop: (() => void) | undefined
  // .pre: the old view is still drawn, so its place is not cut short yet
  $effect.pre(() => {
    const to = view()
    untrack(() => {
      const el = box()
      const place = places.move(last, el ? placeOf(el) : { top: 0 }, to)
      last = to
      if (place === undefined || !el) return
      stop?.()
      stop = scrollWhenDrawn(el, place === 'top' ? { top: 0 } : place)
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
  const miss = (): number => {
    const want = place.row
    const r = want && [...rows(el, want.grid)].find((r) => r.dataset.index === want.index)
    if (!want || !r) return place.top - el.scrollTop
    return r.getBoundingClientRect().top - el.getBoundingClientRect().top - want.y
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
