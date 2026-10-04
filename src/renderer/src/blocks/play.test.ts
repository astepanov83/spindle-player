import { describe, expect, it } from 'vitest'
import { queueLink } from '../../../shared/saved-queue'
import type { ItemKey } from '../../../shared/plugins/items'
import { playOrPause } from './play'

describe('playOrPause', () => {
  const link = queueLink('album', 'al')
  const songs: ItemKey[] = ['files:a1', 'files:a2']
  const has = (k: ItemKey): boolean => songs.includes(k)
  // the queue came from this album, its song is on, radio is off, nothing ended
  const q = {
    link,
    current: 'files:a2' as ItemKey,
    ended: false,
    queuePlays: true,
    sounding: true
  }

  it('plays the list from the start when the queue came from elsewhere', () => {
    expect(playOrPause(link, has, { ...q, link: undefined })).toBe('play')
    expect(playOrPause(link, has, { ...q, link: queueLink('album', 'other') })).toBe('play')
    expect(playOrPause(link, has, { ...q, link: queueLink('playlist', 'al') })).toBe('play')
    expect(playOrPause(undefined, has, q)).toBe('play')
  })

  it('pauses and resumes while the queue is this list', () => {
    expect(playOrPause(link, has, q)).toBe('pause')
    expect(playOrPause(link, has, { ...q, sounding: false })).toBe('resume')
  })

  it('plays again while radio has the player, or once the queue ran out', () => {
    expect(playOrPause(link, has, { ...q, queuePlays: false })).toBe('play')
    expect(playOrPause(link, has, { ...q, sounding: false, ended: true })).toBe('play')
  })

  it('plays when a song added from elsewhere is on', () => {
    // Add to queue keeps the old link
    expect(playOrPause(link, has, { ...q, current: 'files:b1' })).toBe('play')
    expect(playOrPause(link, has, { ...q, current: undefined })).toBe('play')
  })
})
