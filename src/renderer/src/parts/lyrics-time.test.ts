import { describe, expect, it } from 'vitest'
import { songTime } from './lyrics-time'

describe('songTime', () => {
  it('runs on from the last time said while playing', () => {
    expect(songTime(10, 1000, 1000, true)).toBe(10)
    expect(songTime(10, 1000, 1250, true)).toBe(10.25)
  })

  it('runs on half a second at most, and never back', () => {
    expect(songTime(10, 1000, 3000, true)).toBe(10.5)
    expect(songTime(10, 1000, 900, true)).toBe(10)
  })

  it('stays put while paused', () => {
    expect(songTime(10, 1000, 3000, false)).toBe(10)
  })
})
