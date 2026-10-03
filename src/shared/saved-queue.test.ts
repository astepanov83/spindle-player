import { describe, expect, it } from 'vitest'
import {
  applyPlace,
  applyPlaying,
  emptyQueue,
  emptyQueues,
  isKnownQueueFile,
  linkTarget,
  parseSavedQueue,
  parseSavedQueues,
  queueLink,
  savedStation,
  type SavedQueue,
  type SavedQueues
} from './saved-queue'

describe('parseSavedQueue', () => {
  it('gives an empty queue for no file or a wrong one', () => {
    for (const raw of [
      undefined,
      null,
      'x',
      [],
      { items: 'a' },
      { items: [] },
      { items: [1] },
      { items: ['a'] },
      { items: ['radio:x'] }
    ]) {
      expect(parseSavedQueue(raw)).toEqual(emptyQueue())
    }
  })

  it('keeps a good file as it is', () => {
    const good = { items: ['files:a', 'files:b'], index: 1, from: 'Night Bus', pos: 12.5 }
    expect(parseSavedQueue(good)).toEqual(good)
  })

  it('pulls a bad index and position back into range', () => {
    expect(parseSavedQueue({ items: ['files:a', 'files:b'], index: 9, pos: -3 })).toEqual({
      items: ['files:a', 'files:b'],
      index: 1,
      from: '',
      pos: 0
    })
    expect(parseSavedQueue({ items: ['files:a'], index: 0.5, pos: Infinity }).index).toBe(0)
  })

  it('keeps what "From" opens, and drops a bad one (ticket 040)', () => {
    const good = { items: ['files:a'], index: 0, from: 'Blue', pos: 0 }
    for (const link of [
      { plugin: 'files', page: 'album/al1' },
      { plugin: 'files', page: 'artist/marinavale' },
      { plugin: 'files', page: 'folder//music/a' },
      { plugin: 'mfp', page: 'episode/al2' },
      { plugin: 'core', page: 'playlist/p1' }
    ])
      expect(parseSavedQueue({ ...good, link })).toEqual({ ...good, link })
    for (const link of [
      null,
      'al1',
      { kind: 'album', id: 'al1' },
      { plugin: 'files', page: 'song/x' },
      { plugin: 'files', page: 'album' },
      { plugin: 'files', page: 'album/' },
      { plugin: 'mfp', page: 'album/al1' },
      { plugin: 'tv', page: 'album/al1' }
    ])
      expect(parseSavedQueue({ ...good, link })).toEqual(good)
  })

  it('drops items that are not keys of a track plugin', () => {
    const items = ['files:a', 3, '', 'b', 'radio:x', 'tv:y', 'mfp:b']
    expect(parseSavedQueue({ items }).items).toEqual(['files:a', 'mfp:b'])
  })
})

describe('applyPlace', () => {
  const q: SavedQueue = { items: ['files:a', 'files:b', 'files:c'], index: 0, from: 'X', pos: 3 }

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

describe('Play next songs (ticket 037)', () => {
  it('keeps their count, pulled into the list', () => {
    const good = { items: ['files:a', 'files:b', 'files:c'], index: 0, from: 'X', pos: 0, next: 2 }
    expect(parseSavedQueue(good)).toEqual(good)
    expect(parseSavedQueue({ ...good, index: 1, next: 5 }).next).toBe(1)
    for (const next of [0, -1, 1.5, 'x']) {
      expect(parseSavedQueue({ ...good, next })).not.toHaveProperty('next')
    }
  })

  it('moves with the place; a place with none drops them', () => {
    const q: SavedQueue = {
      items: ['files:a', 'files:b', 'files:c'],
      index: 0,
      from: 'X',
      pos: 0,
      next: 2
    }
    expect(applyPlace(q, { index: 1, pos: 0, next: 1 })).toEqual({ ...q, index: 1, next: 1 })
    expect(applyPlace(q, { index: 0, pos: 0, next: 2 })).toBe(q)
    expect(applyPlace(q, { index: 2, pos: 0 })).not.toHaveProperty('next')
    for (const next of [-1, 0.5, 3]) expect(applyPlace(q, { index: 0, pos: 0, next })).toBe(q)
  })
})

describe('links', () => {
  it('builds a link per page kind and reads it back', () => {
    expect(queueLink('album', 'al1')).toEqual({ plugin: 'files', page: 'album/al1' })
    expect(queueLink('episode', 'al2')).toEqual({ plugin: 'mfp', page: 'episode/al2' })
    expect(queueLink('playlist', 'p1')).toEqual({ plugin: 'core', page: 'playlist/p1' })
    // a folder key is a path, with slashes of its own
    expect(linkTarget(queueLink('folder', '/m/a'))).toEqual({ kind: 'folder', id: '/m/a' })
  })
})

describe('isKnownQueueFile', () => {
  it('knows version 2 with a track list', () => {
    expect(isKnownQueueFile(emptyQueues())).toBe(true)
    expect(isKnownQueueFile({ items: [] })).toBe(false)
    expect(isKnownQueueFile({ version: 3, track: { items: [] } })).toBe(false)
    expect(isKnownQueueFile({ version: 2, track: { items: 'a' } })).toBe(false)
    expect(isKnownQueueFile([])).toBe(false)
  })
})

describe('what plays (ticket 027)', () => {
  const track = { items: ['files:a' as const], index: 0, from: 'X', pos: 2 }

  it('keeps a live station, even with no songs in the queue', () => {
    const raw = { ...emptyQueues(), live: { current: 'radio:metal-only' }, active: 'live' }
    expect(parseSavedQueues(raw)).toEqual(raw)
    expect(savedStation(parseSavedQueues(raw))).toBe('metal-only')
    const withSongs = { ...raw, track }
    expect(parseSavedQueues(withSongs)).toEqual(withSongs)
  })

  it('gives the track queue the player with no live item or a bad one', () => {
    for (const current of [null, 'files:a', 'radio:', 'metal-only', 3]) {
      const q = parseSavedQueues({ version: 2, track, live: { current }, active: 'live' })
      expect(q).toEqual({ ...emptyQueues(), track })
      expect(savedStation(q)).toBeUndefined()
    }
    expect(parseSavedQueues({ version: 2, track, active: 'tv' }).active).toBe('track')
    for (const raw of [undefined, null, 'x', []])
      expect(parseSavedQueues(raw)).toEqual(emptyQueues())
  })

  it('applyPlaying sets the live item or the track queue and keeps the list', () => {
    const q: SavedQueues = { ...emptyQueues(), track }
    const radio = applyPlaying(q, { kind: 'radio', station: 'metal-only' })
    expect(radio).toEqual({ ...q, live: { current: 'radio:metal-only' }, active: 'live' })
    expect(radio.track).toBe(q.track)
    expect(applyPlaying(radio, { kind: 'radio', station: 'metal-only' })).toBe(radio)
    // the station stays the live queue's, waiting
    const back = applyPlaying(radio, { kind: 'queue' })
    expect(back).toEqual({ ...radio, active: 'track' })
    expect(savedStation(back)).toBeUndefined()
    expect(applyPlaying(q, { kind: 'queue' })).toBe(q)
    for (const bad of [null, 5, { kind: 'radio' }, { kind: 'radio', station: '../x' }, {}])
      expect(applyPlaying(q, bad)).toBe(q)
  })
})
