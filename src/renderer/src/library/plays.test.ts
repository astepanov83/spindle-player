import { describe, expect, it } from 'vitest'
import type { ItemKey } from '../../../shared/plugins/items'
import { lastPlayedText, PlayCounter, playNeeds, playsOf } from './plays'

const a: ItemKey = 'files:a'
const b: ItemKey = 'files:b'

// A player that plays `key` from `from` for `secs`, a timeupdate every 250ms.
function player(counted: ItemKey[] = []): {
  c: PlayCounter
  clock: { now: number }
  play: (key: ItemKey, from: number, secs: number, duration: number) => number
} {
  const c = new PlayCounter((k) => counted.push(k))
  const clock = { now: 0 }
  const play = (key: ItemKey, from: number, secs: number, duration: number): number => {
    let pos = from
    c.hear(key, pos, duration, true, clock.now)
    for (let t = 0; t < secs * 4; t++) {
      clock.now += 250
      pos += 0.25
      c.hear(key, pos, duration, true, clock.now)
    }
    return pos
  }
  return { c, clock, play }
}

describe('playNeeds', () => {
  it('is half the song or 4 minutes, whichever comes first', () => {
    expect(playNeeds(200)).toBe(100)
    expect(playNeeds(480)).toBe(240)
    expect(playNeeds(3600)).toBe(240)
    // length not known yet
    expect(playNeeds(0)).toBe(240)
  })
})

describe('PlayCounter', () => {
  it('counts a song once half of it was heard, and only once', () => {
    const counted: ItemKey[] = []
    const { play } = player(counted)
    play(a, 0, 49, 100)
    expect(counted).toEqual([])
    play(a, 49, 2, 100)
    expect(counted).toEqual([a])
    play(a, 51, 40, 100)
    expect(counted).toEqual([a])
  })

  it('counts a long song after 4 minutes', () => {
    const counted: ItemKey[] = []
    const { play } = player(counted)
    play(a, 0, 239, 3600)
    expect(counted).toEqual([])
    play(a, 239, 1, 3600)
    expect(counted).toEqual([a])
  })

  it('does not count a seek as heard', () => {
    const counted: ItemKey[] = []
    const { c, clock, play } = player(counted)
    play(a, 0, 10, 100)
    // the seek bar: 80 seconds on in a moment
    clock.now += 250
    c.hear(a, 90, 100, true, clock.now)
    play(a, 90, 9, 100)
    expect(counted).toEqual([])
  })

  it('does not count time while paused, or a seek while paused', () => {
    const counted: ItemKey[] = []
    const { c, clock, play } = player(counted)
    play(a, 0, 30, 100)
    c.hear(a, 30, 100, false, clock.now)
    clock.now += 60_000
    c.hear(a, 80, 100, false, clock.now)
    c.hear(a, 80, 100, true, clock.now)
    expect(counted).toEqual([])
    play(a, 80, 20, 100)
    expect(counted).toEqual([a])
  })

  it('counts time heard while the page was slow to hear about it', () => {
    const counted: ItemKey[] = []
    const { c, clock } = player(counted)
    c.hear(a, 0, 100, true, clock.now)
    // a hidden window gets a timeupdate every few seconds
    for (let pos = 5; pos <= 50; pos += 5) {
      clock.now += 5000
      c.hear(a, pos, 100, true, clock.now)
    }
    expect(counted).toEqual([a])
  })

  it('starts again with the next song, however it starts', () => {
    const counted: ItemKey[] = []
    const { play } = player(counted)
    play(a, 0, 30, 100)
    // a gapless start: the song changes with no stop between
    play(b, 0, 30, 100)
    expect(counted).toEqual([])
    play(b, 30, 25, 100)
    expect(counted).toEqual([b])
  })

  it('counts a song again when it starts over after it counted (Repeat)', () => {
    const counted: ItemKey[] = []
    const { play } = player(counted)
    play(a, 0, 60, 100)
    play(a, 0, 60, 100)
    expect(counted).toEqual([a, a])
  })

  it('keeps what was heard when going back before it counted', () => {
    const counted: ItemKey[] = []
    const { play } = player(counted)
    play(a, 0, 30, 100)
    play(a, 0, 25, 100)
    expect(counted).toEqual([a])
  })

  it('counts nothing with no song', () => {
    const counted: ItemKey[] = []
    const { c } = player(counted)
    for (let t = 0; t < 1000; t++) c.hear(undefined, t, 100, true, t * 1000)
    expect(counted).toEqual([])
  })
})

describe('lastPlayedText', () => {
  const now = new Date(2026, 9, 7, 21, 30).getTime()
  it('gives the time today, the day this year, the year before that', () => {
    expect(lastPlayedText(new Date(2026, 9, 7, 9, 5).getTime(), now)).toBe('09:05')
    expect(lastPlayedText(new Date(2026, 8, 28, 9, 5).getTime(), now)).toBe('28 Sep')
    expect(lastPlayedText(new Date(2025, 11, 31, 9, 5).getTime(), now)).toBe('31 Dec 2025')
  })
})

describe('playsOf', () => {
  it('adds up the counts and keeps the latest play', () => {
    const plays = { [a]: { n: 2, last: 10 }, [b]: { n: 3, last: 5 } }
    const of = (k: ItemKey): { n: number; last: number } | undefined => plays[k]
    expect(playsOf([a, b, 'files:c'], of)).toEqual({ n: 5, last: 10 })
    expect(playsOf(['files:c'], of)).toBeUndefined()
  })
})
