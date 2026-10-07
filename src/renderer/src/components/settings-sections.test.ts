import { describe, expect, it } from 'vitest'
import { plugins } from '../../../shared/plugins'
import { sectionOf, settingsSections } from './settings-sections'

describe('settingsSections', () => {
  const all = settingsSections(plugins)

  it('puts General and Layout first, a section per plugin, then Keyboard', () => {
    expect(all.map((s) => s.label)).toEqual([
      'General',
      'Layout',
      ...plugins.map((p) => p.name),
      'Keyboard'
    ])
    expect(all.filter((s) => s.plugin).map((s) => s.id)).toEqual(plugins.map((p) => p.id))
  })

  it('gives every section its own id', () =>
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length))

  it('falls back to the first section for an id it does not know', () => {
    expect(sectionOf(all, 'keys').label).toBe('Keyboard')
    expect(sectionOf(all, 'gone').id).toBe('general')
    expect(sectionOf(all, null).id).toBe('general')
  })
})
