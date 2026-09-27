import { describe, expect, it } from 'vitest'
import { advance, back, prune, type QueueState } from './logic'

const q = (index: number, items = ['a/0', 'a/1', 'a/2']): QueueState => ({
  items,
  index,
  from: 'A'
})
const nextAlbum = (last: string): string[] => (last.startsWith('a/') ? ['b/0', 'b/1'] : [])

describe('advance', () => {
  it('goes to the next song', () => {
    expect(advance(q(0), { shuffle: false, nextAlbum }).index).toBe(1)
  })

  it('carries on with the next album when the queue runs out', () => {
    const s = advance(q(2), { shuffle: false, nextAlbum })
    expect(s.items).toEqual(['a/0', 'a/1', 'a/2', 'b/0', 'b/1'])
    expect(s.index).toBe(3)
    expect(s.from).toBe('A')
  })

  it('stays put when there is nothing after', () => {
    const s = q(1, ['x/0', 'x/1'])
    expect(advance(s, { shuffle: false, nextAlbum })).toBe(s)
  })

  it('shuffle picks another song, never the current one', () => {
    for (const r of [0, 0.2, 0.5, 0.99]) {
      const s = advance(q(1), { shuffle: true, nextAlbum, random: () => r })
      expect(s.index).not.toBe(1)
      expect(s.index).toBeGreaterThanOrEqual(0)
      expect(s.index).toBeLessThan(3)
    }
  })

  it('shuffle with one song acts like next', () => {
    const s = advance(q(0, ['a/0']), { shuffle: true, nextAlbum: () => ['b/0'] })
    expect(s.index).toBe(1)
  })
})

describe('back', () => {
  it('restarts after 3 seconds', () => {
    expect(back(q(1), 3.5)).toEqual({ state: q(1), restart: true })
  })
  it('goes one back early in the song', () => {
    expect(back(q(1), 2).state.index).toBe(0)
  })
  it('restarts the first song', () => {
    expect(back(q(0), 0).restart).toBe(true)
  })
})

describe('prune', () => {
  const has = (gone: string[]) => (id: string) => !gone.includes(id)

  it('keeps the queue as it is when nothing is gone', () => {
    const s = q(1)
    expect(prune(s, has([]))).toBe(s)
  })

  it('keeps the current song current when others go', () => {
    expect(prune(q(2), has(['a/0']))).toEqual({ items: ['a/1', 'a/2'], index: 1, from: 'A' })
  })

  it('moves to the next song left when the current one is gone', () => {
    expect(prune(q(1), has(['a/1']))).toEqual({ items: ['a/0', 'a/2'], index: 1, from: 'A' })
  })

  it('moves to the last song when the current one and all after it are gone', () => {
    expect(prune(q(1), has(['a/1', 'a/2']))).toEqual({ items: ['a/0'], index: 0, from: 'A' })
  })

  it('empties the queue when every song is gone', () => {
    expect(prune(q(1), () => false)).toEqual({ items: [], index: 0, from: 'A' })
  })
})
