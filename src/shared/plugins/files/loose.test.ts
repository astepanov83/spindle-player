import { describe, expect, it } from 'vitest'
import { isLooseId, looseId, looseParts } from './loose'

describe('loose ids', () => {
  it('are absolute paths, never a library id', () => {
    for (const id of ['/home/me/a.flac', 'C:\\Music\\a.flac', 'd:/a.mp3', '\\\\nas\\m\\a.mp3'])
      expect(isLooseId(id)).toBe(true)
    for (const id of ['3fa1c2d4e5f60718', 'a.flac', 'music/a.flac', ''])
      expect(isLooseId(id)).toBe(false)
  })

  it('name a file by its path', () => {
    expect(looseId('/m/a.flac')).toBe('/m/a.flac')
    expect(looseParts('/m/a.flac')).toEqual({ path: '/m/a.flac' })
  })

  it("name a cue sheet's track by the sheet and its number", () => {
    const id = looseId('/m/Disc.cue', 3)
    expect(id).toBe('/m/Disc.cue#3')
    expect(looseParts(id)).toEqual({ path: '/m/Disc.cue', no: 3 })
    expect(looseParts('C:\\m\\Disc.CUE#12')).toEqual({ path: 'C:\\m\\Disc.CUE', no: 12 })
  })

  it('keep a "#" in a file name', () => {
    expect(looseParts('/m/#1 hits/a.flac')).toEqual({ path: '/m/#1 hits/a.flac' })
    expect(looseParts('/m/a.flac#3')).toEqual({ path: '/m/a.flac#3' })
    expect(looseParts('/m/Disc.cue#0')).toEqual({ path: '/m/Disc.cue#0' })
  })

  it('give nothing for a library id', () => {
    expect(looseParts('3fa1c2d4e5f60718')).toBeUndefined()
  })
})
