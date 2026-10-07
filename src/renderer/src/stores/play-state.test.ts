import { describe, expect, it } from 'vitest'
import type { ItemInfo } from '../plugins/types'
import { barOf } from '../queue/bar'
import { playStateOf, type PlayingNow } from './play-state'

const info = (i: Partial<ItemInfo>): ItemInfo => ({ title: 'Blue Song', ...i }) as ItemInfo

const now = (q: Partial<PlayingNow>): PlayingNow => ({
  info: info({ subtitle: 'The Blues', group: 'Blue Album' }),
  nothingPlaying: false,
  nothing: false,
  wantsSound: true,
  bar: barOf('track', undefined, []),
  ...q
})

describe('playStateOf', () => {
  it('has the song and the artist, without the album', () => {
    expect(playStateOf(now({}))).toEqual({
      title: 'Blue Song',
      artist: 'The Blues',
      playing: true,
      live: false,
      nothing: false,
      next: true,
      previous: true
    })
  })

  it('joins the names as the bar does', () => {
    const i = info({ subtitle: 'A & B', names: [{ name: 'A' }, { name: 'B' }] })
    expect(playStateOf(now({ info: i })).artist).toBe('A, B')
  })

  it('has no text while the bar says Nothing playing', () => {
    const s = playStateOf(now({ nothingPlaying: true, nothing: true, wantsSound: false }))
    expect(s).toMatchObject({ title: '', artist: '', playing: false, nothing: true })
  })

  it('follows the bar for a live item', () => {
    const bar = barOf('live', undefined, [])
    const s = playStateOf(now({ info: info({ title: 'Deep Space One', subtitle: 'Radio' }), bar }))
    expect(s).toMatchObject({
      title: 'Deep Space One',
      artist: 'Radio',
      live: true,
      next: false,
      previous: false
    })
  })
})
