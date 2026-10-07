import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queueLink } from '../../../shared/saved-queue'
import type { ItemKey } from '../../../shared/plugins/items'

const s = vi.hoisted(() => ({
  player: { shuffle: false },
  queue: {
    link: undefined as unknown,
    current: undefined as unknown,
    ended: false,
    playList: vi.fn()
  },
  queues: { active: 'track', wantsSound: true, togglePlay: vi.fn() }
}))
vi.mock('../stores/player.svelte', () => ({ player: s.player }))
vi.mock('../stores/queue.svelte', () => ({ queue: s.queue }))
vi.mock('../stores/queues.svelte', () => ({ queues: s.queues }))

const { playPage, playState } = await import('./page-play')

const link = queueLink('artist', 'x')
const keys: ItemKey[] = ['files:a', 'files:b', 'files:c']

beforeEach(() => {
  s.player.shuffle = false
  s.queue.link = undefined
  s.queue.current = undefined
  s.queue.playList.mockClear()
  s.queues.togglePlay.mockClear()
})

describe('a page Play and Shuffle (ticket 076)', () => {
  it('Play plays in order and turns shuffle off', () => {
    s.player.shuffle = true
    playPage('all', () => keys, 'X', link)
    expect(s.player.shuffle).toBe(false)
    expect(s.queue.playList).toHaveBeenCalledWith(keys, 0, 'X', link)
  })

  it('Shuffle turns shuffle on and starts on a song that can play', () => {
    playPage(
      'shuffle',
      () => keys,
      'X',
      link,
      (k) => k === 'files:c'
    )
    expect(s.player.shuffle).toBe(true)
    expect(s.queue.playList).toHaveBeenCalledWith(keys, 2, 'X', link)
  })

  it('Play starts at the first song that can play, and does nothing with none', () => {
    playPage(
      'all',
      () => keys,
      'X',
      link,
      (k) => k !== 'files:a'
    )
    expect(s.queue.playList).toHaveBeenCalledWith(keys, 1, 'X', link)
    s.queue.playList.mockClear()
    playPage(
      'all',
      () => keys,
      'X',
      link,
      () => false
    )
    expect(s.queue.playList).not.toHaveBeenCalled()
  })

  it('Play pauses while the queue plays the page, Shuffle starts again', () => {
    s.queue.link = link
    s.queue.current = 'files:b'
    expect(playState(link, () => keys)).toBe('pause')
    playPage('all', () => keys, 'X', link)
    expect(s.queues.togglePlay).toHaveBeenCalled()
    expect(s.queue.playList).not.toHaveBeenCalled()
    playPage('shuffle', () => keys, 'X', link)
    expect(s.queue.playList).toHaveBeenCalled()
  })

  it('gathers the songs only when the queue came from this page', () => {
    const songs = vi.fn(() => keys)
    s.queue.link = queueLink('artist', 'other')
    s.queue.current = 'files:b'
    expect(playState(link, songs)).toBe('play')
    expect(songs).not.toHaveBeenCalled()
  })
})
