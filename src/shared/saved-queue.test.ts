import { describe, expect, it } from 'vitest'
import {
  applyPlace,
  applyPlaying,
  emptyQueue,
  isKnownQueueFile,
  parseSavedQueue
} from './saved-queue'

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

describe('applyPlace', () => {
  const q = { items: ['a', 'b', 'c'], index: 0, from: 'X', pos: 3 }

  it('moves to a new song and position, keeping the list', () => {
    const next = applyPlace(q, { index: 2, pos: 0 })
    expect(next).toEqual({ ...q, index: 2, pos: 0 })
    expect(next.items).toBe(q.items)
  })

  it('returns the same queue for no change or a bad message', () => {
    for (const raw of [
      { index: 0, pos: 3 },
      { index: 3, pos: 0 },
      { index: -1, pos: 0 },
      { index: 1.5, pos: 0 },
      { index: 1, pos: -1 },
      { index: 1, pos: NaN },
      { index: 1 },
      5,
      null
    ])
      expect(applyPlace(q, raw)).toBe(q)
    expect(applyPlace(emptyQueue(), { index: 0, pos: 1 })).toEqual(emptyQueue())
  })
})

describe('isKnownQueueFile', () => {
  it('knows any object with a list', () => {
    expect(isKnownQueueFile({ items: [] })).toBe(true)
    expect(isKnownQueueFile({ items: 'a' })).toBe(false)
    expect(isKnownQueueFile([])).toBe(false)
  })
})

describe('what plays (ticket 027)', () => {
  it('keeps radio and its station, even with no songs in the queue', () => {
    const raw = { items: [], index: 0, from: '', pos: 0, kind: 'radio', station: 'metal-only' }
    expect(parseSavedQueue(raw)).toEqual({ ...emptyQueue(), kind: 'radio', station: 'metal-only' })
    const withSongs = { items: ['a'], index: 0, from: 'X', pos: 2, kind: 'radio', station: 'rb-1' }
    expect(parseSavedQueue(withSongs)).toEqual(withSongs)
  })

  it('drops radio with no station or a bad one, and a kind it does not know', () => {
    for (const extra of [
      { kind: 'radio' },
      { kind: 'radio', station: 'a/b' },
      { kind: 'radio', station: 3 },
      { kind: 'tv', station: 'x' },
      { kind: 'queue', station: 'x' }
    ])
      expect(parseSavedQueue({ items: ['a'], ...extra })).toEqual({
        items: ['a'],
        index: 0,
        from: '',
        pos: 0
      })
  })

  it('applyPlaying sets radio or the queue and keeps the list', () => {
    const q = { items: ['a'], index: 0, from: 'X', pos: 3 }
    const radio = applyPlaying(q, { kind: 'radio', station: 'metal-only' })
    expect(radio).toEqual({ ...q, kind: 'radio', station: 'metal-only' })
    expect(radio.items).toBe(q.items)
    expect(applyPlaying(radio, { kind: 'queue' })).toEqual(q)
    expect(applyPlaying(q, { kind: 'queue' })).toBe(q)
    for (const bad of [null, 5, { kind: 'radio' }, { kind: 'radio', station: '../x' }, {}])
      expect(applyPlaying(q, bad)).toBe(q)
  })
})
