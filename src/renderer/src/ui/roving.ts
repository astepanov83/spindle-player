// One Tab stop per list: the rows are [data-row] buttons, and Up, Down,
// Page Up, Page Down, Home and End move the focus between them. Enter
// presses the row (plays it). Only one row can be reached with Tab: the one
// last focused, else the current one (aria-current), else the first on screen.
// A virtual list draws only some rows: it gives each row data-index, its
// `count`, and `scrollTo` to draw a row that is not on screen.
// `rows` is the list shown; a new one (a sort, a search) forgets the row
// last focused, since its number now points at another song.
import { tick } from 'svelte'
import { listStep } from '../keys'

export interface RovingOptions {
  count?: number
  scrollTo?: (index: number) => void
  rows?: unknown
}

// Which drawn row holds the Tab stop. `drawn` are the row numbers on the page.
export function tabStop(
  drawn: number[],
  active: number | null,
  current: number | null,
  shown: number | null
): number | undefined {
  for (const i of [active, current, shown]) if (i !== null && drawn.includes(i)) return i
  return drawn[0]
}

// The drawn row closest to `i`, for the focus when a scroll takes its row away.
export function nearestRow(drawn: number[], i: number): number | undefined {
  let best: number | undefined
  for (const d of drawn) if (best === undefined || Math.abs(d - i) < Math.abs(best - i)) best = d
  return best
}

export function roving(
  node: HTMLElement,
  opts: RovingOptions = {}
): { update(o: RovingOptions): void; destroy(): void } {
  // the row that holds the Tab stop, by number; null: none picked yet
  let active: number | null = null
  // the first row on screen, found when Tab is pressed, not on every scroll
  let shown: number | null = null
  // the row with focus, to notice when a virtual list takes it off the page
  let focused: HTMLElement | null = null

  node.setAttribute('data-rows', '')
  const rows = (): HTMLElement[] => [...node.querySelectorAll<HTMLElement>('[data-row]')]
  const indexOf = (row: HTMLElement, all: HTMLElement[]): number =>
    row.dataset.index !== undefined ? Number(row.dataset.index) : all.indexOf(row)
  const rowAt = (i: number, all = rows()): HTMLElement | undefined =>
    all.find((r) => indexOf(r, all) === i)

  // A row holds focus only in its own line: a radio row's star is part of it.
  function rowOf(t: EventTarget | null, all: HTMLElement[]): HTMLElement | undefined {
    if (!(t instanceof Node)) return undefined
    return all.find((r) => (r.closest('[data-line]') ?? r).contains(t))
  }

  function mark(): void {
    const all = rows()
    if (!all.length) return
    const drawn = all.map((r) => indexOf(r, all))
    const cur = all.find((r) => r.getAttribute('aria-current') === 'true')
    const stop = tabStop(drawn, active, cur ? indexOf(cur, all) : null, shown)
    for (const r of all) r.tabIndex = indexOf(r, all) === stop ? 0 : -1
  }

  // Rows came or went. A focused row that a scroll took away hands the focus
  // to the nearest drawn row, so the next arrow still moves in the list.
  function changed(): void {
    if (focused && !focused.isConnected && active !== null) {
      const at = document.activeElement
      const all = rows()
      const to = nearestRow(
        all.map((r) => indexOf(r, all)),
        active
      )
      const row = to === undefined ? undefined : rowAt(to, all)
      if (row && (!at || at === document.body)) row.focus({ preventScroll: true })
    }
    mark()
  }

  // Tab into a scrolled list lands on the first row on screen, not one above it.
  function ontab(e: KeyboardEvent): void {
    if (e.key !== 'Tab' || active !== null || node.contains(document.activeElement)) return
    const all = rows()
    const box = scrollBox(node)?.getBoundingClientRect()
    const first = box && all.find((r) => r.getBoundingClientRect().top >= box.top - 1)
    shown = first ? indexOf(first, all) : null
    mark()
  }

  async function focusRow(i: number): Promise<void> {
    active = i
    let row = rowAt(i)
    if (!row && opts.scrollTo) {
      opts.scrollTo(i)
      await tick()
      // the virtual list draws on its next frame
      await new Promise((r) => requestAnimationFrame(r))
      row = rowAt(i)
    }
    mark()
    row?.focus({ preventScroll: true })
    row?.scrollIntoView({ block: 'nearest' })
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const all = rows()
    const row = rowOf(e.target, all)
    if (!row) return
    const count = opts.count ?? all.length
    const page = Math.max(
      1,
      Math.floor((scrollBox(node)?.clientHeight ?? 400) / row.offsetHeight) - 1
    )
    const to = listStep(e.key, indexOf(row, all), count, page)
    if (to === null) return
    e.preventDefault()
    void focusRow(to)
  }

  function onfocusin(e: FocusEvent): void {
    const all = rows()
    const row = rowOf(e.target, all)
    if (!row) return
    focused = row
    active = indexOf(row, all)
    mark()
  }

  // Focus left the row. Still on the page: the user moved it (a click, Tab).
  // Gone from the page: a scroll took it, and changed() finds it a new row.
  function onfocusout(): void {
    const was = focused
    queueMicrotask(() => {
      if (was?.isConnected && focused === was) focused = null
    })
  }

  const watch = new MutationObserver(changed)
  watch.observe(node, { childList: true, subtree: true })
  node.addEventListener('keydown', onkeydown)
  node.addEventListener('focusin', onfocusin)
  node.addEventListener('focusout', onfocusout)
  window.addEventListener('keydown', ontab, true)
  mark()

  return {
    update(o) {
      if (o.rows !== opts.rows) {
        // other songs in the same places: keep only the row that has focus now
        const all = rows()
        const row = rowOf(document.activeElement, all)
        active = row ? indexOf(row, all) : null
        shown = null
      }
      opts = o
      if (active !== null && o.count !== undefined && active >= o.count) active = null
      mark()
    },
    destroy() {
      watch.disconnect()
      node.removeEventListener('keydown', onkeydown)
      node.removeEventListener('focusin', onfocusin)
      node.removeEventListener('focusout', onfocusout)
      window.removeEventListener('keydown', ontab, true)
    }
  }
}

function scrollBox(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return null
}
