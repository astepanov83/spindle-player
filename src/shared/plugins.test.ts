import { describe, expect, it } from 'vitest'
import { isPluginId, plugins, switchablePlugins } from './plugins'
import { queueLink, type LinkKind } from './saved-queue'

describe('plugin list', () => {
  it('lists files, radio, mfp in that order', () => {
    expect(plugins.map((p) => p.id)).toEqual(['files', 'radio', 'mfp'])
  })

  it('has the defaults and item kinds', () => {
    expect(plugins.map((p) => [p.defaultOn, p.itemKind])).toEqual([
      [true, 'track'],
      [true, 'live'],
      [false, 'track']
    ])
  })

  it('has a name and a line for each', () => {
    for (const p of plugins) {
      expect(p.name).not.toBe('')
      expect(p.about).not.toBe('')
    }
  })

  it('knows its ids', () => {
    expect(isPluginId('mfp')).toBe(true)
    expect(isPluginId('jukebox')).toBe(false)
    expect(isPluginId(undefined)).toBe(false)
  })

  it('only shows switches for plugins in the list', () => {
    for (const id of switchablePlugins) expect(isPluginId(id)).toBe(true)
  })

  it('gives each kind of "From" page to one plugin, and a playlist to the core', () => {
    const kinds = plugins.flatMap((p) => p.linkKinds)
    expect(new Set(kinds).size).toBe(kinds.length)
    const all: LinkKind[] = ['album', 'artist', 'folder', 'episode', 'playlist']
    expect(all.map((k) => queueLink(k, 'x').plugin)).toEqual([
      'files',
      'files',
      'files',
      'mfp',
      'core'
    ])
  })

  it('reads an old switch only for the plugins that had one', () => {
    expect(plugins.map((p) => p.oldSwitch)).toEqual([undefined, undefined, 'mfp'])
  })
})
