import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queueLink } from '../../../shared/saved-queue'
import type { ItemKey } from '../../../shared/plugins/items'

const s = vi.hoisted(() => ({
  player: { shuffle: false, shuffleBy: 'songs' },
  queue: {
    link: undefined as unknown,
    current: undefined as unknown,
    ended: false,
    playList: vi.fn()
  },
  queues: { active: 'track', wantsSound: true, togglePlay: vi.fn() }
}))
vi.mock('../stores/player.svelte', () => ({ player: s.player }))
// keys are "files:<album><n>"; "x" is no album
const albumOf = (k: string): string | undefined => (k[6] === 'x' ? undefined : k[6])
vi.mock('../stores/queue.svelte', () => ({ queue: s.queue, albumOf }))
vi.mock('../stores/queues.svelte', () => ({ queues: s.queues }))

const { playPage, playState, shuffleStart } = await import('./page-play')

const link = queueLink('artist', 'x')
const keys: ItemKey[] = ['files:a', 'files:b', 'files:c']

beforeEach(() => {
  s.player.shuffle = false
  s.player.shuffleBy = 'songs'
  s.queue.link = undefined
  s.queue.current = undefined
  s.queue.playList.mockClear()
  s.queues.togglePlay.mockClear()
})

describe('a page Play and Shuffle (ticket 076)', () => {
  it('Play plays in order and turns shuffle off', () => {
    s.player.shuffle = true
    playPage('all', () => keys, link)
    expect(s.player.shuffle).toBe(false)
    expect(s.queue.playList).toHaveBeenCalledWith(keys, 0, link)
  })

  it('Shuffle turns shuffle on and starts on a song that can play', () => {
    playPage(
      'shuffle',
      () => keys,
      link,
      (k) => k === 'files:c'
    )
    expect(s.player.shuffle).toBe(true)
    expect(s.queue.playList).toHaveBeenCalledWith(keys, 2, link)
  })

  it('Play starts at the first song that can play, and does nothing with none', () => {
    playPage(
      'all',
      () => keys,
      link,
      (k) => k !== 'files:a'
    )
    expect(s.queue.playList).toHaveBeenCalledWith(keys, 1, link)
    s.queue.playList.mockClear()
    playPage(
      'all',
      () => keys,
      link,
      () => false
    )
    expect(s.queue.playList).not.toHaveBeenCalled()
  })

  it('Play pauses while the queue plays the page, Shuffle starts again', () => {
    s.queue.link = link
    s.queue.current = 'files:b'
    expect(playState(link, () => keys)).toBe('pause')
    playPage('all', () => keys, link)
    expect(s.queues.togglePlay).toHaveBeenCalled()
    expect(s.queue.playList).not.toHaveBeenCalled()
    playPage('shuffle', () => keys, link)
    expect(s.queue.playList).toHaveBeenCalled()
  })

  it('Start plays a part of the page in order and never pauses (099)', () => {
    s.player.shuffle = true
    s.queue.link = link
    s.queue.current = 'files:b'
    playPage('start', () => ['files:b', 'files:c'], link)
    expect(s.queues.togglePlay).not.toHaveBeenCalled()
    expect(s.player.shuffle).toBe(false)
    expect(s.queue.playList).toHaveBeenCalledWith(['files:b', 'files:c'], 0, link)
  })

  it('gathers the songs only when the queue came from this page', () => {
    const songs = vi.fn(() => keys)
    s.queue.link = queueLink('artist', 'other')
    s.queue.current = 'files:b'
    expect(playState(link, songs)).toBe('play')
    expect(songs).not.toHaveBeenCalled()
  })
})

describe('a page Shuffle by album (ticket 125)', () => {
  const list: ItemKey[] = ['files:a1', 'files:a2', 'files:b1', 'files:b2', 'files:x1', 'files:x2']
  const all = [0, 1, 2, 3, 4, 5]

  it('starts on the first song of a random album; a song with no album is one', () => {
    const at = (r: number): number => shuffleStart(list, all, albumOf, true, () => r).at
    expect([0, 0.3, 0.6, 0.9].map(at)).toEqual([0, 2, 4, 5])
    // the first that can play
    expect(shuffleStart(list, [1, 3], albumOf, true, () => 0)).toEqual({ at: 1, byAlbum: true })
  })

  it('shuffles the songs of a list of one album', () => {
    const one: ItemKey[] = ['files:a1', 'files:a2', 'files:a3']
    expect(shuffleStart(one, [0, 1, 2], albumOf, true, () => 0.9)).toEqual({
      at: 2,
      byAlbum: false
    })
  })

  it('keeps shuffle by album on, or picks songs for one album', () => {
    s.player.shuffleBy = 'albums'
    playPage('shuffle', () => list, link)
    expect(s.player).toMatchObject({ shuffle: true, shuffleBy: 'albums' })
    expect([0, 2, 4, 5]).toContain(s.queue.playList.mock.calls[0][1])
    playPage('shuffle', () => ['files:a1', 'files:a2'], link)
    expect(s.player).toMatchObject({ shuffle: true, shuffleBy: 'songs' })
  })
})
