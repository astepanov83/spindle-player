import { describe, expect, it, vi } from 'vitest'
import type { ItemKey } from '../../../shared/plugins/items'

vi.mock('./queue.svelte', () => ({ queue: {} }))
vi.mock('./player.svelte', () => ({ player: { playing: false } }))
const { openSongs } = await import('./open-songs')
type OpenTo = import('./open-songs').OpenTo

interface Fake {
  to: OpenTo
  done: unknown[][]
}

// a queue that keeps what was done to it
function fake(items: ItemKey[], playing: boolean): Fake {
  const done: unknown[][] = []
  const queue = {
    items,
    playList: (keys: ItemKey[], i: number) => void done.push(['playList', keys, i]),
    append: (keys: ItemKey[]) => {
      done.push(['append', keys])
      queue.items = [...queue.items, ...keys]
    },
    jump: (i: number) => void done.push(['jump', i])
  }
  return { to: { queue: queue as unknown as OpenTo['queue'], playing: () => playing }, done }
}

// made-up keys: the queue here is a fake, and the core names no plugin
const a = 'p:/m/a.flac' as ItemKey
const b = 'p:3fa1c2d4e5f60718' as ItemKey
const old = 'p:0000000000000000' as ItemKey

describe('openSongs', () => {
  it('replaces the queue and plays for Open with', () => {
    const f = fake([old], true)
    openSongs([a, b], 'play', f.to)
    expect(f.done).toEqual([['playList', [a, b], 0]])
  })

  it('adds a drop to the end of the queue while a song plays', () => {
    const f = fake([old], true)
    openSongs([a], 'add', f.to)
    expect(f.done).toEqual([['append', [a]]])
  })

  it('plays a drop at once when nothing plays', () => {
    const f = fake([old], false)
    openSongs([a, b], 'add', f.to)
    expect(f.done).toEqual([
      ['append', [a, b]],
      ['jump', 1]
    ])
  })

  it('plays a drop on an empty queue', () => {
    const f = fake([], false)
    openSongs([a], 'add', f.to)
    expect(f.done).toEqual([
      ['append', [a]],
      ['jump', 0]
    ])
  })

  it('does nothing with no songs', () => {
    const f = fake([old], false)
    openSongs([], 'add', f.to)
    openSongs([], 'play', f.to)
    expect(f.done).toEqual([])
  })
})
