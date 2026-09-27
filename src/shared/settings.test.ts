import { describe, expect, it } from 'vitest'
import { defaultSettings, pageSettings, parseStoredSettings } from './settings'

const defaults = { ...defaultSettings(), windowSizes: {} }

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
      windowSizes: { focus: { width: 500, height: 700 }, studio: { width: 1300, height: 800 } }
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
})

describe('pageSettings', () => {
  it('leaves out window sizes and copies the queue', () => {
    const stored = parseStoredSettings({ windowSizes: { focus: { width: 500, height: 700 } } })
    const page = pageSettings(stored)
    expect(page).toEqual(defaultSettings())
    page.queue.studio = 'col'
    expect(stored.queue.studio).toBe('tab')
  })
})
