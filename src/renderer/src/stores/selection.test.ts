import { describe, expect, it } from 'vitest'
import { RowSelection, selection } from './selection.svelte'
import { listRows, numberRows } from '../ui/selection'
import type { ItemKey } from '../../../shared/plugins/items'

// any ids do: the songs are what the list says they are
const same = (ids: string[]): ItemKey[] => ids as ItemKey[]

const plain = { ctrlKey: false, shiftKey: false }
const ctrl = { ctrlKey: true, shiftKey: false }
const shift = { ctrlKey: false, shiftKey: true }

describe('RowSelection', () => {
  const songs = listRows(['a', 'b', 'c', 'd'])

  it('a plain click plays; Ctrl and Shift select and do not', () => {
    const s = new RowSelection(() => songs, same)
    expect(s.click(1, plain)).toBe(false)
    expect(s.click(3, shift)).toBe(true)
    expect(s.songs()).toEqual(['b', 'c', 'd'])
    expect(s.click(2, ctrl)).toBe(true)
    expect(s.songs()).toEqual(['b', 'd'])
    expect(selection.songs).toEqual(['b', 'd'])
    expect(s.clear()).toBe(true)
    expect(s.clear()).toBe(false)
    expect(selection.list).toBe(null)
  })

  it('one list at a time: selecting in another clears the first', () => {
    const items = ['x', 'y', 'x']
    const a = new RowSelection(() => songs, same)
    const q = new RowSelection(
      () => numberRows(3),
      (rows) => same(rows.map((r) => items[r]))
    )
    a.all()
    expect(selection.songs).toHaveLength(4)
    q.click(0, ctrl)
    q.click(2, ctrl)
    expect(a.size).toBe(0)
    // the queue's rows are numbers, so a song in it twice is selected twice
    expect(selection.songs).toEqual(['x', 'x'])
    q.clear()
  })

  it('a right-click on a row that is not selected acts on it alone', () => {
    const s = new RowSelection(() => songs, same)
    s.click(0, ctrl)
    s.click(1, ctrl)
    expect(s.menu(1)).toEqual(['a', 'b'])
    expect(s.menu(3)).toEqual(['d'])
    expect(s.size).toBe(0)
  })
})
