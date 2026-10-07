// The level a song plays at from its ReplayGain tags, and when By album
// uses album gain.
import { describe, expect, it } from 'vitest'
import { gainFactor, gainUse } from './replaygain'

const db = (f: number): number => 20 * Math.log10(f)

describe('gainFactor', () => {
  it('is 1 when off or with no tags', () => {
    expect(gainFactor({ track: -6 }, 'off')).toBe(1)
    expect(gainFactor(undefined, 'song')).toBe(1)
    expect(gainFactor({}, 'album')).toBe(1)
  })

  it('turns dB into a factor', () => {
    expect(db(gainFactor({ track: -6 }, 'song'))).toBeCloseTo(-6)
    expect(gainFactor({ track: 0 }, 'song')).toBe(1)
    expect(db(gainFactor({ track: 3.5 }, 'song'))).toBeCloseTo(3.5)
  })

  it('takes the gain the setting asks for, else the other one', () => {
    const g = { track: -8, album: -6 }
    expect(db(gainFactor(g, 'song'))).toBeCloseTo(-8)
    expect(db(gainFactor(g, 'album'))).toBeCloseTo(-6)
    expect(db(gainFactor({ album: -6 }, 'song'))).toBeCloseTo(-6)
    expect(db(gainFactor({ track: -8 }, 'album'))).toBeCloseTo(-8)
  })

  it('keeps a boost from taking the peak past full scale', () => {
    // +6 dB is 2x; a peak of 0.8 allows 1.25x
    expect(gainFactor({ track: 6, trackPeak: 0.8 }, 'song')).toBeCloseTo(1.25)
    // a cut is never made louder by the peak
    expect(db(gainFactor({ track: -6, trackPeak: 0.8 }, 'song'))).toBeCloseTo(-6)
    // a file that already clips is brought down to full scale
    expect(gainFactor({ track: 0, trackPeak: 1.25 }, 'song')).toBeCloseTo(0.8)
  })

  it('pairs each gain with its own peak, else the other one', () => {
    const g = { track: 6, trackPeak: 0.5, album: 6, albumPeak: 0.8 }
    expect(gainFactor(g, 'song')).toBeCloseTo(10 ** (6 / 20))
    expect(gainFactor(g, 'album')).toBeCloseTo(1.25)
    expect(gainFactor({ track: 6, albumPeak: 0.8 }, 'song')).toBeCloseTo(1.25)
    expect(gainFactor({ album: 6, trackPeak: 0.8 }, 'album')).toBeCloseTo(1.25)
  })
})

describe('gainUse', () => {
  // keys are "<album><n>"
  const albumOf = (k: string): string | undefined => (k.startsWith('x') ? undefined : k[0])
  const q = (items: string[], index: number): { items: string[]; index: number } => ({
    items,
    index
  })

  it('Off and By song are what they say', () => {
    expect(gainUse('off', q(['a1', 'a2'], 0), false, albumOf)).toBe('off')
    expect(gainUse('song', q(['a1', 'a2'], 0), false, albumOf)).toBe('song')
  })

  it('By album uses album gain among its own album in order', () => {
    const items = ['a1', 'a2', 'a3']
    for (const i of [0, 1, 2]) expect(gainUse('album', q(items, i), false, albumOf)).toBe('album')
  })

  it('a song with no song of its album next to it uses its own gain', () => {
    const items = ['a1', 'b1', 'c1', 'c2']
    expect(gainUse('album', q(items, 0), false, albumOf)).toBe('song')
    expect(gainUse('album', q(items, 1), false, albumOf)).toBe('song')
    expect(gainUse('album', q(items, 2), false, albumOf)).toBe('album')
    expect(gainUse('album', q(['a1'], 0), false, albumOf)).toBe('song')
  })

  it('shuffle always uses the song’s own gain', () => {
    expect(gainUse('album', q(['a1', 'a2', 'a3'], 1), true, albumOf)).toBe('song')
  })

  it('songs with no album are not one album', () => {
    expect(gainUse('album', q(['x1', 'x2'], 0), false, albumOf)).toBe('song')
  })
})
