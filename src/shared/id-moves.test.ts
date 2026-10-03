import { describe, expect, it } from 'vitest'
import { mergeMoves, moveKeys, movePlaylists, moveQueue, splitMoves } from './id-moves'
import { parsePlaylists, playlistsFile, type Playlist } from './playlists'
import type { ItemKey } from './plugins/items'
import { emptyQueues, parseSavedQueues, type SavedQueues } from './saved-queue'

const moves = { a: 'A', b: 'B' }

describe('moveKeys', () => {
  it('renames moved files keys in place and keeps the rest', () => {
    expect(moveKeys(['files:x', 'files:a', 'files:y', 'files:b'], moves)).toEqual([
      'files:x',
      'files:A',
      'files:y',
      'files:B'
    ])
  })

  it("leaves other plugins' keys alone, also with the same id", () => {
    const keys = ['mfp:a', 'radio:b'] as const
    expect(moveKeys([...keys], moves)).toEqual(keys)
    expect(moveKeys(['mfp:a', 'files:a'], moves)).toEqual(['mfp:a', 'files:A'])
  })

  it('gives the same list when nothing moved', () => {
    const keys: ItemKey[] = ['files:x', 'mfp:a']
    expect(moveKeys(keys, moves)).toBe(keys)
  })

  it('ignores names an object has on its own prototype', () => {
    const keys: ItemKey[] = ['files:constructor', 'files:toString']
    expect(moveKeys(keys, moves)).toEqual(keys)
  })
})

describe('movePlaylists', () => {
  it('renames songs in each playlist, once each, and passes the file check', () => {
    const list: Playlist[] = [
      { id: 'p1', name: 'One', items: ['files:a', 'files:x', 'mfp:b'] },
      { id: 'p2', name: 'Two', items: ['files:y', 'mfp:a'] },
      // both the old and the new id: the song stays once
      { id: 'p3', name: 'Three', items: ['files:A', 'files:a'] }
    ]
    const out = movePlaylists(list, moves)
    expect(out[0].items).toEqual(['files:A', 'files:x', 'mfp:b'])
    expect(out[1]).toBe(list[1])
    expect(out[2].items).toEqual(['files:A'])
    expect(parsePlaylists(playlistsFile(out))).toEqual(out)
  })

  it('gives the same list when nothing moved', () => {
    const list: Playlist[] = [{ id: 'p', name: 'P', items: ['files:x'] }]
    expect(movePlaylists(list, moves)).toBe(list)
  })
})

describe('moveQueue', () => {
  const queues = (items: ItemKey[]): SavedQueues => ({
    ...emptyQueues(),
    track: { items, index: 1, from: 'Album', pos: 12 }
  })

  it('renames the track queue and keeps its place', () => {
    const out = moveQueue(queues(['files:x', 'files:a', 'mfp:b']), moves)
    expect(out.track).toEqual({
      items: ['files:x', 'files:A', 'mfp:b'],
      index: 1,
      from: 'Album',
      pos: 12
    })
    expect(parseSavedQueues(out)).toEqual(out)
  })

  it('gives the same queue when nothing moved', () => {
    const q = queues(['files:x', 'mfp:a'])
    expect(moveQueue(q, moves)).toBe(q)
  })
})

describe('mergeMoves', () => {
  it('follows a move of a move', () => {
    expect(mergeMoves({ a: 'b' }, { b: 'c', d: 'e' })).toEqual({ a: 'c', b: 'c', d: 'e' })
  })
})

describe('splitMoves', () => {
  it('renames now only what the library already has', () => {
    const lib = new Set(['A'])
    expect(splitMoves({ a: 'A', b: 'B' }, (id) => lib.has(id))).toEqual({
      now: { a: 'A' },
      later: { b: 'B' }
    })
  })
})
