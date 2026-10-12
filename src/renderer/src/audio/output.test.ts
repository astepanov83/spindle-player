import { describe, expect, it } from 'vitest'
import { outputChoices, outputDevices } from './output'

const dev = (kind: string, deviceId: string, label = ''): MediaDeviceInfo =>
  ({ kind, deviceId, label }) as MediaDeviceInfo

describe('outputDevices', () => {
  it('keeps the outputs, without the entries that follow the system default', () => {
    const list = [
      dev('audioinput', 'default', 'Default'),
      dev('audiooutput', 'default', 'Default'),
      dev('audiooutput', 'communications', 'Communications - Speakers'),
      dev('audiooutput', 'a1', 'Speakers'),
      dev('videoinput', 'v1', 'Camera'),
      dev('audiooutput', 'b2', ' USB DAC ')
    ]
    expect(outputDevices(list)).toEqual([
      { id: 'a1', name: 'Speakers' },
      { id: 'b2', name: 'USB DAC' }
    ])
  })

  it('numbers devices with no name, and lists each once', () => {
    const list = [dev('audiooutput', 'a1'), dev('audiooutput', 'a1'), dev('audiooutput', 'b2')]
    expect(outputDevices(list)).toEqual([
      { id: 'a1', name: 'Output 1' },
      { id: 'b2', name: 'Output 2' }
    ])
  })
})

describe('outputChoices', () => {
  const devices = [{ id: 'a1', name: 'Speakers' }]

  it('starts with the system default', () => {
    expect(outputChoices(devices, '', '')).toEqual([
      { id: '', name: 'System default' },
      { id: 'a1', name: 'Speakers' }
    ])
    expect(outputChoices(devices, 'a1', 'Speakers')).toHaveLength(2)
  })

  it('keeps the saved device when it is not there, by its name', () => {
    expect(outputChoices(devices, 'b2', 'USB DAC').at(-1)).toEqual({
      id: 'b2',
      name: 'USB DAC (not connected)'
    })
    expect(outputChoices(null, 'b2', '')).toEqual([
      { id: '', name: 'System default' },
      { id: 'b2', name: 'Saved device (not connected)' }
    ])
  })
})
