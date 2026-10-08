// Songs dragged from a song list or an album tile (ticket 089) onto a
// playlist, the Playlists chip, the queue, or to another place in their own
// playlist. Pointer events, as the queue's own drag: the page takes HTML5
// drops for files from the system (main.ts), and the drag must go on when
// the list it started in goes away (the drawer opening over it).
import type { Art } from '../../../shared/library'
import type { ItemKey } from '../../../shared/plugins/items'
import type { QueueLink } from '../../../shared/saved-queue'
import { edgeStep } from '../ui/drag-rows'

export interface DragSongs {
  keys: ItemKey[]
  // names the songs when they start an empty queue ("From ...")
  from?: string
  link?: QueueLink
  // what the copy under the pointer shows
  title: string
  sub?: string
  art?: Art
  // the list it started in: a playlist's table takes only its own rows
  source?: object
}

export interface DropTarget {
  // false: the songs can't land here, and the target is passed over
  takes?(d: DragSongs): boolean
  // the pointer moved over it, at x, y in the window
  over?(d: DragSongs, x: number, y: number): void
  leave?(): void
  drop(d: DragSongs, x: number, y: number): void
  // the pointer rested on it a moment: the Queue tab and button open the queue
  rest?(): void
  // scrolls while the pointer is near its top or bottom edge
  scroller?(): HTMLElement | undefined
}

// The part of an element the store needs, so tests can give plain objects.
export interface Spot {
  parentElement: Spot | null
  toggleAttribute?(name: string, on: boolean): void
}

type Hit = (x: number, y: number) => Spot | null

// a move shorter than this is a click
const START = 5
// how long the pointer rests on a target before it opens
export const REST = 700

const targets = new WeakMap<Spot, DropTarget>()

class SongDragStore {
  // the songs on the move, with the pointer. Raw: the keys go to main as
  // they are (a playlist, the queue), and a proxy can't be sent.
  drag: (DragSongs & { x: number; y: number }) | null = $state.raw(null)
  // the target under the pointer
  over: Spot | null = $state.raw(null)

  #press: { x: number; y: number; what: () => DragSongs | undefined } | null = null
  // the click that ends a drag must not play or open what was pressed
  #dragged = false
  #restTimer: ReturnType<typeof setTimeout> | undefined
  #scrollTimer: ReturnType<typeof setInterval> | undefined
  // the last target that scrolls, kept while the pointer is over its header
  #scroller: HTMLElement | undefined
  #hit: Hit = (x, y) => document.elementFromPoint(x, y)
  #off: (() => void) | undefined

  // Tests find targets without a page.
  useHit(hit: Hit): void {
    this.#hit = hit
  }

  target(spot: Spot, t: DropTarget): () => void {
    targets.set(spot, t)
    return () => {
      targets.delete(spot)
      if (this.over === spot) this.#setOver(null)
    }
  }

  swap(spot: Spot, t: DropTarget): void {
    if (targets.has(spot)) targets.set(spot, t)
  }

  // A press on a song row or a tile. The drag starts when the pointer has
  // moved a few pixels; `what` then says which songs go.
  press(
    e: Pick<PointerEvent, 'button' | 'clientX' | 'clientY'>,
    what: () => DragSongs | undefined
  ): void {
    if (e.button !== 0) return
    this.end()
    this.#press = { x: e.clientX, y: e.clientY, what }
    this.#listen()
  }

  move(x: number, y: number): void {
    const p = this.#press
    if (!p) return
    if (!this.drag) {
      if (Math.hypot(x - p.x, y - p.y) < START) return
      const d = p.what()
      if (!d?.keys.length) {
        this.end()
        return
      }
      this.drag = { ...d, keys: [...d.keys], x, y }
      this.#scrollTimer = setInterval(() => this.#edgeScroll(), 16)
      dragging(true)
    }
    const d = { ...this.drag, x, y }
    this.drag = d
    const spot = this.#find(x, y, d)
    this.#setOver(spot)
    const t = spot && targets.get(spot)
    const s = t?.scroller?.()
    if (s) this.#scroller = s
    t?.over?.(d, x, y)
  }

  release(): void {
    const d = this.drag
    const spot = this.over
    const t = spot && targets.get(spot)
    const was = !!d
    this.end()
    if (!was) return
    this.#dragged = true
    // no click comes when the pointer left what it pressed
    setTimeout(() => (this.#dragged = false))
    if (d && t) t.drop(d, d.x, d.y)
  }

  // Escape, a lost pointer, the window losing focus: nothing moves.
  end(): void {
    this.#off?.()
    this.#off = undefined
    this.#press = null
    clearInterval(this.#scrollTimer)
    this.#scroller = undefined
    this.#setOver(null)
    if (this.drag) dragging(false)
    this.drag = null
  }

  // True once after a drag ended: the click it brings is not a click.
  tookClick(): boolean {
    const was = this.#dragged
    this.#dragged = false
    return was
  }

  // The innermost target under the pointer that takes these songs.
  #find(x: number, y: number, d: DragSongs): Spot | null {
    for (let n = this.#hit(x, y); n; n = n.parentElement) {
      const t = targets.get(n)
      if (t && (t.takes?.(d) ?? true)) return n
    }
    return null
  }

  #setOver(spot: Spot | null): void {
    const was = this.over
    if (spot === was) return
    if (was) {
      was.toggleAttribute?.('data-drop-over', false)
      targets.get(was)?.leave?.()
    }
    clearTimeout(this.#restTimer)
    this.over = spot
    if (!spot) return
    const t = targets.get(spot)
    // a target that draws where the songs land marks itself
    if (!t?.over) spot.toggleAttribute?.('data-drop-over', true)
    if (t?.rest) this.#restTimer = setTimeout(() => this.over === spot && t.rest?.(), REST)
  }

  #edgeScroll(): void {
    const d = this.drag
    const s = this.#scroller
    if (!d || !s?.isConnected) return
    const r = s.getBoundingClientRect()
    if (d.x < r.left || d.x > r.right || d.y < r.top || d.y > r.bottom) return
    const step = edgeStep(d.y, r.top, r.bottom)
    if (!step) return
    const top = s.scrollTop
    s.scrollTop += step
    // the rows moved under the pointer
    if (s.scrollTop !== top) this.move(d.x, d.y)
  }

  #listen(): void {
    const w = globalThis.window
    if (!w?.addEventListener) return
    const move = (e: PointerEvent): void => this.move(e.clientX, e.clientY)
    const up = (): void => this.release()
    const cancel = (): void => this.end()
    // in capture, so App's Escape (which closes the drawer) never sees it
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !this.drag) return
      e.stopPropagation()
      e.preventDefault()
      this.end()
    }
    w.addEventListener('pointermove', move)
    w.addEventListener('pointerup', up)
    w.addEventListener('pointercancel', cancel)
    w.addEventListener('blur', cancel)
    w.addEventListener('keydown', key, true)
    this.#off = () => {
      w.removeEventListener('pointermove', move)
      w.removeEventListener('pointerup', up)
      w.removeEventListener('pointercancel', cancel)
      w.removeEventListener('blur', cancel)
      w.removeEventListener('keydown', key, true)
    }
  }
}

// The whole page shows the grabbing hand meanwhile (controls.css).
function dragging(on: boolean): void {
  globalThis.document?.documentElement.classList.toggle('song-drag', on)
}

export const songDrag = new SongDragStore()

// A drop target, for an element's `use:`.
export function dropTarget(
  node: HTMLElement,
  t: DropTarget | undefined
): { update(t: DropTarget | undefined): void; destroy(): void } {
  let off = t ? songDrag.target(node, t) : undefined
  return {
    // a new object on each redraw: swapped in place, so a drag over it goes on
    update(next) {
      if (next && off) songDrag.swap(node, next)
      else {
        off?.()
        off = next ? songDrag.target(node, next) : undefined
      }
    },
    destroy() {
      off?.()
    }
  }
}
