import { describe, expect, it } from 'vitest'
import { gain, heard, muteToggle, silent, volumeIcon, wheelStep } from './volume'

describe('gain', () => {
  it('maps the slider to 0..1 on a curve', () => {
    expect(gain(0)).toBe(0)
    expect(gain(50)).toBe(0.25)
    expect(gain(100)).toBe(1)
  })
  it('keeps out-of-range values in range', () => {
    expect(gain(-10)).toBe(0)
    expect(gain(130)).toBe(1)
  })
})

describe('mute', () => {
  it('keeps the volume while muted and gives the gain node 0', () => {
    const m = muteToggle({ volume: 60, muted: false }, 70)
    expect(m).toEqual({ volume: 60, muted: true })
    expect(heard(m)).toBe(0)
    expect(heard({ volume: 60, muted: false })).toBe(60)
  })
  it('unmutes back to the same volume', () =>
    expect(muteToggle({ volume: 60, muted: true }, 70)).toEqual({ volume: 60, muted: false }))
  it('at 0% counts as muted, and the button brings back the kept volume', () => {
    expect(silent({ volume: 0, muted: false })).toBe(true)
    expect(muteToggle({ volume: 0, muted: false }, 40)).toEqual({ volume: 40, muted: false })
    expect(muteToggle({ volume: 0, muted: true }, 40)).toEqual({ volume: 40, muted: false })
  })
  it('picks the speaker for muted, low and high', () => {
    expect(volumeIcon({ volume: 80, muted: true })).toBe('volMute')
    expect(volumeIcon({ volume: 0, muted: false })).toBe('volMute')
    expect(volumeIcon({ volume: 1, muted: false })).toBe('volLow')
    expect(volumeIcon({ volume: 49, muted: false })).toBe('volLow')
    expect(volumeIcon({ volume: 50, muted: false })).toBe('volHigh')
    expect(volumeIcon({ volume: 100, muted: false })).toBe('volHigh')
  })
})

describe('wheelStep', () => {
  const px = (deltaY: number): { deltaY: number; deltaMode: number } => ({ deltaY, deltaMode: 0 })
  it('takes one step per mouse notch, up is louder', () => {
    expect(wheelStep(0, px(-100))).toEqual({ step: 1, rest: 0 })
    expect(wheelStep(0, px(53))).toEqual({ step: -1, rest: 0 })
    expect(wheelStep(0, { deltaY: 3, deltaMode: 1 })).toEqual({ step: -1, rest: 0 })
  })
  it('adds up small touchpad moves', () => {
    let r = wheelStep(0, px(-20))
    expect(r).toEqual({ step: 0, rest: -20 })
    r = wheelStep(r.rest, px(-20))
    expect(r.step).toBe(0)
    r = wheelStep(r.rest, px(-20))
    expect(r).toEqual({ step: 1, rest: 0 })
  })
  it('drops what was left when the wheel turns the other way', () =>
    expect(wheelStep(-40, px(20))).toEqual({ step: 0, rest: 20 }))
  it('keeps what was left on a sideways move', () =>
    expect(wheelStep(-40, px(0))).toEqual({ step: 0, rest: -40 }))
})
