import { describe, expect, it } from 'vitest'
import type {
  FullLibrary,
  LibraryMessage,
  LibraryPatch,
  LibraryVersion
} from '../../../../shared/plugins/files/library-patch'
import { LibraryFeed } from './library-feed'

const full = (n: number, epoch = 'a'): FullLibrary => ({
  epoch,
  n,
  albums: [],
  tracks: [],
  folders: []
})
const patch = (from: number, epoch = 'a'): LibraryPatch => ({
  patch: true,
  epoch,
  from,
  n: from + 1,
  albums: [],
  tracks: [],
  goneTracks: []
})

// A page that keeps the version of what it applied, and a main that answers
// the whole library when asked.
function setup(latest: () => FullLibrary = () => full(0)): {
  feed: LibraryFeed
  applied: string[]
  asked: () => number
  answer: () => Promise<void>
  failures: unknown[]
} {
  let have: LibraryVersion | undefined = { epoch: 'a', n: 0 }
  const applied: string[] = []
  const failures: unknown[] = []
  let asked = 0
  let answers: (() => void)[] = []
  const feed = new LibraryFeed({
    have: () => have,
    apply: (m: LibraryMessage) => {
      if ('patch' in m && m.albums.some((a) => a.id === 'bad')) throw new Error('does not fit')
      applied.push('patch' in m ? `patch ${m.from}-${m.n}` : `full ${m.n}`)
      have = { epoch: m.epoch, n: m.n }
    },
    fetch: () => {
      asked++
      return new Promise((r) => answers.push(() => r(latest())))
    },
    fail: (e) => failures.push(e)
  })
  return {
    feed,
    applied,
    asked: () => asked,
    answer: async () => {
      const a = answers
      answers = []
      for (const f of a) f()
      await new Promise((r) => setTimeout(r, 0))
    },
    failures
  }
}

describe('LibraryFeed', () => {
  it('applies patches in order and skips ones the page has', () => {
    const { feed, applied, asked } = setup()
    feed.take(patch(0))
    feed.take(patch(1))
    feed.take(patch(0))
    expect(applied).toEqual(['patch 0-1', 'patch 1-2'])
    expect(asked()).toBe(0)
  })

  it('asks once for the whole library after a gap, then goes on with what came meanwhile', async () => {
    const { feed, applied, asked, answer } = setup(() => full(3))
    feed.take(patch(2))
    feed.take(patch(3))
    feed.take(patch(4))
    expect(asked()).toBe(1)
    await answer()
    // the whole library was at 3; 3-4 came after it, 2-3 is in it
    expect(applied).toEqual(['full 3', 'patch 3-4', 'patch 4-5'])
  })

  it('asks for the whole library after a restart of the library process', async () => {
    const { feed, applied, asked, answer } = setup(() => full(0, 'b'))
    feed.take(patch(0, 'b'))
    expect(asked()).toBe(1)
    await answer()
    expect(applied).toEqual(['full 0'])
  })

  it('asks for the whole library when a patch does not fit', async () => {
    const { feed, applied, asked, answer } = setup(() => full(1))
    feed.take({ ...patch(0), albums: [{ id: 'bad' } as never] })
    expect(asked()).toBe(1)
    await answer()
    expect(applied).toEqual(['full 1'])
  })

  it('reports a failed ask and takes the next library as it comes', async () => {
    let have: LibraryVersion = { epoch: 'a', n: 0 }
    const failures: unknown[] = []
    const applied: number[] = []
    const feed = new LibraryFeed({
      have: () => have,
      apply: (m) => {
        applied.push(m.n)
        have = { epoch: m.epoch, n: m.n }
      },
      fetch: () => Promise.reject(new Error('gone')),
      fail: (e) => failures.push(e)
    })
    feed.take(patch(5))
    await new Promise((r) => setTimeout(r, 0))
    expect(failures.length).toBe(1)
    feed.take(full(7))
    expect(applied).toEqual([7])
  })
})
