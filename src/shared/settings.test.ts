import { describe, expect, it } from 'vitest'
import {
  defaultSettings,
  isKnownSettingsFile,
  pageSettings,
  parseStoredSettings,
  type StoredSettings
} from './settings'

const defaults = { ...defaultSettings(), windowSizes: {}, folders: [] }

describe('parseStoredSettings', () => {
  it('gives the defaults for no file or a file that is not an object', () => {
    for (const raw of [undefined, null, 42, 'studio', [], true]) {
      expect(parseStoredSettings(raw)).toEqual(defaults)
    }
  })

  it('keeps a good file as it is', () => {
    const good = {
      template: 'focus',
      queue: { studio: 'col', classic: 'col', focus: 'drawer' },
      visualizer: 'wave',
      theme: 'light',
      volume: 35,
      windowSizes: { focus: { width: 500, height: 700 }, studio: { width: 1300, height: 800 } },
      folders: ['/home/me/Music', '/mnt/nas/music']
    }
    expect(parseStoredSettings(good)).toEqual(good)
  })

  it('replaces only the wrong fields', () => {
    const s = parseStoredSettings({
      template: 'mini',
      queue: { studio: 'col', classic: 'tab', focus: 7 },
      visualizer: 'spectrum',
      theme: 'blue'
    })
    expect(s.template).toBe('studio')
    // Classic does not offer Tab, so it gets its default
    expect(s.queue).toEqual({ studio: 'col', classic: 'drawer', focus: 'tab' })
    expect(s.visualizer).toBe('spectrum')
    expect(s.theme).toBe('system')
  })

  it('fills in a missing queue entry and ignores unknown keys', () => {
    const s = parseStoredSettings({ queue: { focus: 'drawer', mini: 'tab' }, extra: 1 })
    expect(s.queue).toEqual({ studio: 'tab', classic: 'drawer', focus: 'drawer' })
    expect(s).not.toHaveProperty('extra')
  })

  it('drops broken window sizes and keeps good ones', () => {
    const s = parseStoredSettings({
      windowSizes: {
        studio: { width: '1200', height: 700 },
        classic: { width: NaN, height: 700 },
        focus: { width: 450.6, height: 690.2 },
        mini: { width: 300, height: 300 }
      }
    })
    expect(s.windowSizes).toEqual({ focus: { width: 451, height: 690 } })
  })

  it('raises a window size below the template minimum and caps a huge one', () => {
    const s = parseStoredSettings({
      windowSizes: { focus: { width: 100, height: 100 }, studio: { width: 1e9, height: 600 } }
    })
    expect(s.windowSizes.focus).toEqual({ width: 380, height: 560 })
    expect(s.windowSizes.studio).toEqual({ width: 16384, height: 600 })
  })

  it('treats a windowSizes that is not an object as empty', () => {
    expect(parseStoredSettings({ windowSizes: [1, 2] }).windowSizes).toEqual({})
  })

  it('keeps only absolute folder paths, each once, without a trailing slash', () => {
    const s = parseStoredSettings({
      folders: ['/music/', 'relative/path', '', 7, '/music', 'C:\\Music\\', '/', '/a//']
    })
    expect(s.folders).toEqual(['/music', 'C:\\Music', '/', '/a'])
  })

  it('keeps the volume between 0 and 100, as a whole number', () => {
    expect(parseStoredSettings({ volume: 42.4 }).volume).toBe(42)
    expect(parseStoredSettings({ volume: -5 }).volume).toBe(0)
    expect(parseStoredSettings({ volume: 250 }).volume).toBe(100)
    expect(parseStoredSettings({ volume: '50' }).volume).toBe(70)
    expect(parseStoredSettings({ volume: NaN }).volume).toBe(70)
  })

  it('treats folders that are not a list as none', () => {
    expect(parseStoredSettings({ folders: '/music' }).folders).toEqual([])
  })
})

describe('pageSettings', () => {
  it('leaves out window sizes and folders, and copies the queue', () => {
    const stored = parseStoredSettings({
      windowSizes: { focus: { width: 500, height: 700 } },
      folders: ['/music']
    })
    const page = pageSettings(stored)
    expect(page).toEqual(defaultSettings())
    page.queue.studio = 'col'
    expect(stored.queue.studio).toBe('tab')
  })
})

describe('parseStoredSettings with a base', () => {
  const current: StoredSettings = {
    template: 'focus',
    queue: { studio: 'col', classic: 'col', focus: 'drawer' },
    visualizer: 'wave',
    theme: 'light',
    volume: 35,
    windowSizes: { focus: { width: 500, height: 700 } },
    folders: ['/m']
  }

  it('keeps the current value of each bad field, not the default', () => {
    const s = parseStoredSettings(
      {
        template: 'mini',
        queue: { studio: 'tab', focus: 9 },
        visualizer: 1,
        theme: 'dark',
        volume: 'x'
      },
      current
    )
    expect(s).toEqual({ ...current, theme: 'dark', queue: { ...current.queue, studio: 'tab' } })
  })

  it('gives the base for junk', () => {
    expect(parseStoredSettings('junk', current)).toEqual(current)
  })
})

describe('isKnownSettingsFile', () => {
  it('knows a good file, a partial one and an empty one', () => {
    expect(isKnownSettingsFile({})).toBe(true)
    expect(isKnownSettingsFile({ theme: 'dark', folders: ['/m', '/n'] })).toBe(true)
    expect(isKnownSettingsFile({ ...defaultSettings(), windowSizes: {}, folders: [] })).toBe(true)
  })

  it('does not know a file the next save would lose something from', () => {
    for (const raw of [
      [],
      'x',
      null,
      { theme: 'blue' },
      { template: 'mini' },
      { visualizer: 'bars' },
      { volume: '50' },
      { queue: [] },
      { windowSizes: 'big' },
      { folders: '/m' },
      { folders: ['relative/path'] },
      { folders: ['/m', 7] },
      { eq: [1, 2] },
      { volume: 150 },
      { volume: 40.5 }
    ])
      expect(isKnownSettingsFile(raw)).toBe(false)
  })

  it('checks the modes inside queue', () => {
    expect(isKnownSettingsFile({ queue: { studio: 'col' } })).toBe(true)
    expect(isKnownSettingsFile({ queue: { studio: 'col', classic: 'drawer', focus: 'tab' } })).toBe(
      true
    )
    // classic does not offer tab; mini is no template; 7 is no mode
    for (const queue of [{ classic: 'tab' }, { mini: 'tab' }, { studio: 7 }])
      expect(isKnownSettingsFile({ queue })).toBe(false)
  })

  it('checks the sizes inside windowSizes', () => {
    expect(isKnownSettingsFile({ windowSizes: { focus: { width: 500, height: 700 } } })).toBe(true)
    for (const windowSizes of [
      { focus: { width: 100, height: 700 } },
      { focus: { width: 500.4, height: 700 } },
      { focus: { width: 99999, height: 700 } },
      { focus: { width: '500', height: 700 } },
      { focus: { width: 500, height: 700, x: 3 } },
      { focus: [500, 700] },
      { mini: { width: 500, height: 700 } }
    ])
      expect(isKnownSettingsFile({ windowSizes })).toBe(false)
  })
})
