// The song drag (ticket 089) with plain objects for the page: which target
// is under the pointer, what it hears, and the click a drag leaves behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REST, songDrag, type DragSongs, type DropTarget, type Spot } from './song-drag.svelte'
import type { ItemKey } from '../../../shared/plugins/items'

// an element: its parent, and the attribute that lights it up
function spot(parent: Spot | null = null): Spot & { lit: boolean } {
  const s = {
    parentElement: parent,
    lit: false,
    toggleAttribute: (_: string, on: boolean) => (s.lit = on)
  }
  return s
}

const songs = (...ids: string[]): DragSongs => ({
  keys: ids.map((i) => `p:${i}` as ItemKey),
  title: ids[0]
})
const at = (x: number, y = 0): Pick<PointerEvent, 'button' | 'clientX' | 'clientY'> => ({
  button: 0,
  clientX: x,
  clientY: y
})

// what is under the pointer, by x
let under: (x: number) => Spot | null = () => null
const offs: (() => void)[] = []
const add = (s: Spot, t: DropTarget): void => void offs.push(songDrag.target(s, t))

beforeEach(() => {
  under = () => null
  songDrag.useHit((x) => under(x))
})

afterEach(() => {
  songDrag.end()
  offs.splice(0).forEach((off) => off())
  vi.useRealTimers()
})

describe('starting a drag', () => {
  it('starts only after the pointer moved a few pixels, and asks for the songs then', () => {
    const what = vi.fn(() => songs('a'))
    songDrag.press(at(100, 100), what)
    songDrag.move(103, 102)
    expect(songDrag.drag).toBe(null)
    expect(what).not.toHaveBeenCalled()
    songDrag.move(106, 100)
    expect(songDrag.drag?.keys).toEqual(['p:a'])
    expect(what).toHaveBeenCalledTimes(1)
  })

  it('does nothing for another button, or with no songs', () => {
    songDrag.press({ ...at(0), button: 2 }, () => songs('a'))
    songDrag.move(50, 0)
    expect(songDrag.drag).toBe(null)
    songDrag.press(at(0), () => songs())
    songDrag.move(50, 0)
    expect(songDrag.drag).toBe(null)
  })

  it('a press with no move is a click: nothing is taken from it', () => {
    songDrag.press(at(0), () => songs('a'))
    songDrag.release()
    expect(songDrag.tookClick()).toBe(false)
  })
})

describe('targets', () => {
  it('finds the innermost target that takes the songs, and lights up a plain one', () => {
    const outer = spot()
    const inner = spot(outer)
    const leaf = spot(inner)
    const outerDrop = vi.fn()
    add(outer, { drop: outerDrop })
    add(inner, { takes: (d) => d.keys.length > 1, drop: () => {} })
    under = () => leaf
    songDrag.press(at(0), () => songs('a'))
    songDrag.move(20, 0)
    // one song: the inner target says no, so the outer one has it
    expect(songDrag.over).toBe(outer)
    expect(outer.lit).toBe(true)
    songDrag.release()
    expect(outer.lit).toBe(false)
    expect(outerDrop).toHaveBeenCalledWith(expect.objectContaining({ keys: ['p:a'] }), 20, 0)
  })

  it('tells a target that draws the drop place where the pointer is, and when it left', () => {
    const zone = spot()
    const seen: number[] = []
    const leave = vi.fn()
    add(zone, { over: (_d, _x, y) => seen.push(y), leave, drop: () => {} })
    under = (x) => (x < 100 ? zone : null)
    songDrag.press(at(0, 10), () => songs('a'))
    songDrag.move(10, 20)
    songDrag.move(10, 30)
    expect(seen).toEqual([20, 30])
    // it draws its own mark
    expect(zone.lit).toBe(false)
    songDrag.move(200, 30)
    expect(leave).toHaveBeenCalledTimes(1)
    expect(songDrag.over).toBe(null)
  })

  it('drops nothing over no target, and the click after any drag is not a click', () => {
    const drop = vi.fn()
    add(spot(), { drop })
    songDrag.press(at(0), () => songs('a'))
    songDrag.move(30, 0)
    songDrag.release()
    expect(drop).not.toHaveBeenCalled()
    expect(songDrag.drag).toBe(null)
    expect(songDrag.tookClick()).toBe(true)
    expect(songDrag.tookClick()).toBe(false)
  })

  it('Escape (end) drops nothing', () => {
    const t = spot()
    const drop = vi.fn()
    add(t, { drop })
    under = () => t
    songDrag.press(at(0), () => songs('a'))
    songDrag.move(30, 0)
    songDrag.end()
    songDrag.release()
    expect(drop).not.toHaveBeenCalled()
    expect(t.lit).toBe(false)
  })

  it('opens a target the pointer rests on, but not one it only passed over', () => {
    vi.useFakeTimers()
    const tab = spot()
    const rest = vi.fn()
    add(tab, { drop: () => {}, rest })
    let x = 50
    under = () => (x < 100 ? tab : null)
    songDrag.press(at(0), () => songs('a'))
    songDrag.move(x, 0)
    vi.advanceTimersByTime(REST - 100)
    x = 200
    songDrag.move(x, 0)
    vi.advanceTimersByTime(REST)
    expect(rest).not.toHaveBeenCalled()
    x = 60
    songDrag.move(x, 0)
    // moves on it do not start the wait again
    vi.advanceTimersByTime(REST / 2)
    songDrag.move(61, 0)
    vi.advanceTimersByTime(REST / 2)
    expect(rest).toHaveBeenCalledTimes(1)
  })

  it('a target that goes away mid-drag is no longer under the pointer', () => {
    const t = spot()
    const off = songDrag.target(t, { drop: () => {} })
    under = () => t
    songDrag.press(at(0), () => songs('a'))
    songDrag.move(30, 0)
    expect(songDrag.over).toBe(t)
    off()
    expect(songDrag.over).toBe(null)
    expect(t.lit).toBe(false)
  })
})
