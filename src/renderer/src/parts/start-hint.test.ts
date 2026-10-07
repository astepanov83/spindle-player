import { describe, expect, it } from 'vitest'
import { startHint } from './start-hint'

const first = 'first-plugin'

describe('startHint', () => {
  it('asks to pick music when a plugin is on and the library shows', () => {
    expect(startHint({ anyPluginOn: true, hasLibrary: true, firstPlugin: first })).toEqual({
      text: 'Pick an album or a song to start',
      settings: null
    })
  })

  it('sends Focus to another layout, with Settings on Layout', () => {
    expect(startHint({ anyPluginOn: true, hasLibrary: false, firstPlugin: first })).toEqual({
      text: 'Switch to Studio or Classic to pick music',
      settings: 'layout'
    })
  })

  it("asks to turn on a plugin when every one is off, on the first plugin's section", () => {
    for (const hasLibrary of [true, false])
      expect(startHint({ anyPluginOn: false, hasLibrary, firstPlugin: first })).toEqual({
        text: 'Turn on a plugin in Settings',
        settings: first
      })
  })
})
