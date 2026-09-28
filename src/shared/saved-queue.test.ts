import { describe, expect, it } from 'vitest'
import { emptyQueue, parseSavedQueue } from './saved-queue'

describe('parseSavedQueue', () => {
  it('gives an empty queue for no file or a wrong one', () => {
    for (const raw of [undefined, null, 'x', [], { items: 'a' }, { items: [] }, { items: [1] }]) {
      expect(parseSavedQueue(raw)).toEqual(emptyQueue())
    }
  })

  it('keeps a good file as it is', () => {
    const good = { items: ['a', 'b'], index: 1, from: 'Night Bus', pos: 12.5 }
    expect(parseSavedQueue(good)).toEqual(good)
  })

  it('pulls a bad index and position back into range', () => {
    expect(parseSavedQueue({ items: ['a', 'b'], index: 9, pos: -3 })).toEqual({
      items: ['a', 'b'],
      index: 1,
      from: '',
      pos: 0
    })
    expect(parseSavedQueue({ items: ['a'], index: 0.5, pos: Infinity }).index).toBe(0)
  })

  it('drops ids that are not strings', () => {
    expect(parseSavedQueue({ items: ['a', 3, '', 'b'] }).items).toEqual(['a', 'b'])
  })
})
