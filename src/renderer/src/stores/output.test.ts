// The sound output: the list follows devicechange, and a saved device that
// is gone plays on the default, says so once and comes back by itself.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineEvents } from '../audio/engine'

const engine = vi.hoisted(() => ({
  sinks: [] as string[],
  events: {} as Partial<EngineEvents>,
  on(e: Partial<EngineEvents>): void {
    Object.assign(this.events, e)
  },
  setOutput(id: string): void {
    this.sinks.push(id || 'default')
  }
}))
vi.mock('../audio/engine', () => ({ engine }))

const { output } = await import('./output.svelte')
const { notice } = await import('./notice.svelte')
const { notFoundText } = await import('../audio/output')

// The system's device list; `plug` changes it and tells the page.
class FakeMedia extends EventTarget {
  ids: string[] = []
  asks = 0
  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    this.asks++
    const all = ['default', ...this.ids]
    return all.map(
      (id) => ({ kind: 'audiooutput', deviceId: id, label: id.toUpperCase() }) as MediaDeviceInfo
    )
  }
  async plug(...ids: string[]): Promise<void> {
    this.ids = ids
    this.dispatchEvent(new Event('devicechange'))
    await vi.advanceTimersByTimeAsync(0)
  }
}

let media: FakeMedia
// Settings is open
let quiet = false
// notices shown, in order
let said: string[]

beforeEach(async () => {
  vi.useFakeTimers()
  engine.sinks = []
  said = []
  quiet = false
  vi.spyOn(notice, 'show').mockImplementation((t) => void said.push(t))
  output.use('')
  media = new FakeMedia()
  media.ids = ['dac', 'hdmi']
  output.start(() => quiet, media)
  await vi.advanceTimersByTimeAsync(0)
  engine.sinks = []
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the output store', () => {
  it('lists the devices and follows devicechange', async () => {
    expect(output.devices).toEqual([
      { id: 'dac', name: 'DAC' },
      { id: 'hdmi', name: 'HDMI' }
    ])
    await media.plug('hdmi', 'usb')
    expect(output.devices?.map((d) => d.id)).toEqual(['hdmi', 'usb'])
  })

  it('plays on the saved device, and the default when set back', () => {
    output.use('dac')
    expect(engine.sinks).toEqual(['dac'])
    output.use('')
    expect(engine.sinks).toEqual(['dac', 'default'])
    expect(output.missing).toBe(false)
    expect(said).toEqual([])
  })

  it('a saved device unplugged: the default, said once, kept, and used again when it is back', async () => {
    output.use('dac')
    await media.plug('hdmi')
    expect(engine.sinks.at(-1)).toBe('default')
    expect(output.missing).toBe(true)
    expect(said).toEqual([notFoundText])
    // other devices come and go: nothing more is said
    await media.plug('hdmi', 'usb')
    await media.plug('usb')
    expect(said).toHaveLength(1)
    expect(engine.sinks.at(-1)).toBe('default')
    await media.plug('usb', 'dac')
    expect(engine.sinks.at(-1)).toBe('dac')
    expect(output.missing).toBe(false)
    // gone again: said again
    await media.plug('usb')
    expect(said).toHaveLength(2)
  })

  it('a saved device that is not there at start says so', async () => {
    await media.plug('hdmi')
    engine.sinks = []
    output.use('dac')
    expect(engine.sinks).toEqual(['default'])
    expect(said).toEqual([notFoundText])
  })

  it('a device that fails while listed waits until it is plugged in again, or picked again', async () => {
    output.use('dac')
    engine.events.outputFailed?.('dac')
    expect(output.missing).toBe(true)
    expect(said).toEqual([notFoundText])
    // still listed after a devicechange: not tried again
    await media.plug('dac', 'hdmi', 'usb')
    expect(engine.sinks.at(-1)).toBe('default')
    // the unplug that follows says nothing more; the plug tries it again
    await media.plug('hdmi')
    await media.plug('hdmi', 'dac')
    expect(engine.sinks.at(-1)).toBe('dac')
    expect(said).toHaveLength(1)
    // another device's failure, or one asked for before, is not this one's
    engine.events.outputFailed?.('hdmi')
    expect(output.missing).toBe(false)
    // picked again after failing
    engine.events.outputFailed?.('dac')
    output.use('hdmi')
    output.use('dac')
    expect(engine.sinks.at(-1)).toBe('dac')
  })

  it('asks for the list every 3 s while a device is saved, since Chromium may not say', async () => {
    media.asks = 0
    await vi.advanceTimersByTimeAsync(10000)
    expect(media.asks).toBe(0)
    output.use('dac')
    // gone without a devicechange
    media.ids = ['hdmi']
    await vi.advanceTimersByTimeAsync(3000)
    expect(media.asks).toBe(1)
    expect(output.missing).toBe(true)
    expect(said).toEqual([notFoundText])
    media.ids = ['hdmi', 'dac']
    await vi.advanceTimersByTimeAsync(3000)
    expect(engine.sinks.at(-1)).toBe('dac')
    output.use('')
    media.asks = 0
    await vi.advanceTimersByTimeAsync(10000)
    expect(media.asks).toBe(0)
  })

  it('keeps the list fresh while Settings shows it', async () => {
    media.asks = 0
    const stop = output.watch()
    await vi.advanceTimersByTimeAsync(0)
    expect(media.asks).toBe(1)
    media.ids = ['dac', 'hdmi', 'usb']
    await vi.advanceTimersByTimeAsync(3000)
    expect(output.devices?.map((d) => d.id)).toEqual(['dac', 'hdmi', 'usb'])
    stop()
    media.asks = 0
    await vi.advanceTimersByTimeAsync(10000)
    expect(media.asks).toBe(0)
  })

  it('says nothing while Settings is open: its choice shows the device is gone', async () => {
    quiet = true
    output.use('dac')
    await media.plug('hdmi')
    expect(output.missing).toBe(true)
    expect(said).toEqual([])
    // not later either, for the same time it is gone
    quiet = false
    await media.plug('hdmi', 'usb')
    expect(said).toEqual([])
  })
})
