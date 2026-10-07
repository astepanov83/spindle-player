// The sound store: a change unmutes, and Mute at 0% brings back the last
// volume the user left it at.
import { beforeEach, describe, expect, it, vi } from 'vitest'

let s: typeof import('./sound.svelte')
let settings: (typeof import('./settings.svelte'))['settings']

beforeEach(async () => {
  // a fresh store each time: it remembers the kept volume
  vi.resetModules()
  settings = (await import('./settings.svelte')).settings
  settings.volume = 60
  s = await import('./sound.svelte')
})

describe('sound', () => {
  it('mutes and unmutes, keeping the volume', () => {
    s.toggleMute()
    expect(s.sound.muted).toBe(true)
    expect(settings.volume).toBe(60)
    s.toggleMute()
    expect(s.sound.muted).toBe(false)
    expect(settings.volume).toBe(60)
  })
  it('unmutes on any volume change: key, wheel or slider', () => {
    s.toggleMute()
    s.stepVolume(1)
    expect(s.sound.muted).toBe(false)
    expect(settings.volume).toBe(65)
    s.toggleMute()
    s.setVolume(30, false)
    expect(s.sound.muted).toBe(false)
  })
  it('steps 5% a wheel notch and stops the page from scrolling', () => {
    const e = { deltaY: -100, deltaMode: 0, preventDefault: vi.fn() } as unknown as WheelEvent
    s.wheelVolume(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(settings.volume).toBe(65)
  })
  it('brings back the start volume after a drag to 0%', () => {
    s.setVolume(30, false)
    s.setVolume(3, false)
    s.setVolume(0)
    s.toggleMute()
    expect(settings.volume).toBe(60)
  })
  it('brings back where the slider was last left, not what a drag passed', () => {
    s.setVolume(40)
    s.setVolume(12, false)
    s.setVolume(0)
    s.toggleMute()
    expect(settings.volume).toBe(40)
  })
  it('falls back to 70% when nothing loud enough was ever set', () => {
    settings.volume = 0
    s.toggleMute()
    expect(settings.volume).toBe(70)
    expect(s.sound.muted).toBe(false)
  })
})
