import { describe, expect, it } from 'vitest'
import { mergeMoves, moveIds, movePlaylists, moveQueue } from './id-moves'
import { parsePlaylists, playlistsFile } from './playlists'
import { parseSavedQueue } from './saved-queue'

const moves = { a: 'A', b: 'B' }

describe('moveIds', () => {
  it('renames moved ids in place and keeps the rest', () => {
    expect(moveIds(['x', 'a', 'y', 'b'], moves)).toEqual(['x', 'A', 'y', 'B'])
  })

  it('gives the same list when nothing moved', () => {
    const ids = ['x', 'y']
    expect(moveIds(ids, moves)).toBe(ids)
  })

  it('ignores names an object has on its own prototype', () => {
    expect(moveIds(['constructor', 'toString'], moves)).toEqual(['constructor', 'toString'])
  })
})

describe('movePlaylists', () => {
  it('renames songs in each playlist, once each, and passes the file check', () => {
    const list = [
      { id: 'p1', name: 'One', trackIds: ['a', 'x'] },
      { id: 'p2', name: 'Two', trackIds: ['y'] },
      // both the old and the new id: the song stays once
      { id: 'p3', name: 'Three', trackIds: ['A', 'a'] }
    ]
    const out = movePlaylists(list, moves)
    expect(out[0].trackIds).toEqual(['A', 'x'])
    expect(out[1]).toBe(list[1])
    expect(out[2].trackIds).toEqual(['A'])
    expect(parsePlaylists(playlistsFile(out))).toEqual(out)
  })

  it('gives the same list when nothing moved', () => {
    const list = [{ id: 'p', name: 'P', trackIds: ['x'] }]
    expect(movePlaylists(list, moves)).toBe(list)
  })
})

describe('moveQueue', () => {
  it('renames the queue and keeps its place', () => {
    const q = { items: ['x', 'a', 'b'], index: 1, from: 'Album', pos: 12 }
    const out = moveQueue(q, moves)
    expect(out).toEqual({ items: ['x', 'A', 'B'], index: 1, from: 'Album', pos: 12 })
    expect(parseSavedQueue(out)).toEqual(out)
  })

  it('gives the same queue when nothing moved', () => {
    const q = { items: ['x'], index: 0, from: '', pos: 0 }
    expect(moveQueue(q, moves)).toBe(q)
  })
})

describe('mergeMoves', () => {
  it('follows a move of a move', () => {
    expect(mergeMoves({ a: 'b' }, { b: 'c', d: 'e' })).toEqual({ a: 'c', b: 'c', d: 'e' })
  })
})
