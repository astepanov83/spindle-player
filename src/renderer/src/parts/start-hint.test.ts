import { describe, expect, it } from 'vitest'
import { startHint } from './start-hint'

describe('startHint', () => {
  it('asks to pick music when a plugin is on and the library shows', () => {
    expect(startHint({ anyPluginOn: true, hasLibrary: true })).toEqual({
      text: 'Pick an album or a song to start',
      settings: false
    })
  })

  it('sends Focus to another layout', () => {
    expect(startHint({ anyPluginOn: true, hasLibrary: false }).text).toBe(
      'Switch to Studio or Classic to pick music'
    )
  })

  it('asks to turn on a plugin when every one is off, in any layout', () => {
    for (const hasLibrary of [true, false])
      expect(startHint({ anyPluginOn: false, hasLibrary })).toEqual({
        text: 'Turn on a plugin in Settings',
        settings: true
      })
  })
})
