// The rows' offset in the scroll box, with fake elements and observers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listOffset, watchOffset } from './list-offset'

class FakeResizeObserver {
  static all: FakeResizeObserver[] = []
  watched = new Set<unknown>()
  constructor(readonly cb: () => void) {
    FakeResizeObserver.all.push(this)
  }
  observe(el: unknown): void {
    this.watched.add(el)
  }
  disconnect(): void {
    this.watched.clear()
  }
}

class FakeMutationObserver {
  static all: FakeMutationObserver[] = []
  watched: unknown[] = []
  constructor(readonly cb: () => void) {
    FakeMutationObserver.all.push(this)
  }
  observe(el: unknown): void {
    this.watched.push(el)
  }
  disconnect(): void {
    this.watched = []
  }
}

// Just the tree links and a top.
class El {
  parentElement: El | null = null
  previousElementSibling: El | null = null
  clientTop = 0
  scrollTop = 0
  constructor(public top = 0) {}
  getBoundingClientRect(): { top: number } {
    return { top: this.top }
  }
}

function child(parent: El, before: El | null, top = 0): El {
  const el = new El(top)
  el.parentElement = parent
  el.previousElementSibling = before
  return el
}

beforeEach(() => {
  FakeResizeObserver.all = []
  FakeMutationObserver.all = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('MutationObserver', FakeMutationObserver)
})
afterEach(() => vi.unstubAllGlobals())

describe('listOffset', () => {
  it('is the rows’ top in the scrolled content', () => {
    expect(listOffset(150, 100, 0, 0)).toBe(50)
    // scrolled down 30px: the rows are 30px higher on screen, same place in the content
    expect(listOffset(120, 100, 0, 30)).toBe(50)
    expect(listOffset(151, 100, 1, 0)).toBe(50)
  })
})

describe('watchOffset', () => {
  // box > [header, table > [head, rows]]
  function page(): { box: El; header: El; head: El; rows: El } {
    const box = new El(100)
    const header = child(box, null, 100)
    const table = child(box, header, 180)
    const head = child(table, null, 180)
    const rows = child(table, head, 218)
    return { box, header, head, rows }
  }

  it('gives the offset at once and when something above changes size', () => {
    const { box, head, header, rows } = page()
    const got: number[] = []
    watchOffset(rows as unknown as HTMLElement, box as unknown as HTMLElement, (m) => got.push(m))
    expect(got).toEqual([118])
    const ro = FakeResizeObserver.all[0]
    expect([...ro.watched]).toEqual([head, header])
    // the header wraps onto two lines
    rows.top = 250
    ro.cb()
    expect(got).toEqual([118, 150])
    // a resize that moves nothing says nothing
    ro.cb()
    expect(got).toEqual([118, 150])
  })

  it('watches a line added above the rows, and stops', () => {
    const { box, header, rows } = page()
    const got: number[] = []
    const stop = watchOffset(
      rows as unknown as HTMLElement,
      box as unknown as HTMLElement,
      (m) => got.push(m)
    )
    const mo = FakeMutationObserver.all[0]
    // the table and the box, not the rows (which change on every scroll)
    expect(mo.watched).toEqual([rows.parentElement, box])
    const note = child(box, header, 180)
    rows.parentElement!.previousElementSibling = note
    rows.top = 240
    mo.cb()
    expect(got).toEqual([118, 140])
    expect(FakeResizeObserver.all[0].watched.has(note)).toBe(true)
    stop()
    expect(FakeResizeObserver.all[0].watched.size).toBe(0)
    expect(mo.watched).toEqual([])
  })
})
