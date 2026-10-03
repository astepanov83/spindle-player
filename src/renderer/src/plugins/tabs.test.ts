// The order of the library's tabs (spec "Pages and tabs", Tab order).
import { describe, expect, it } from 'vitest'
import { orderTabs, tabsIn, type ShownTab } from './tabs'

const tab = (id: string, plugin: ShownTab['plugin'], only?: ShownTab['only']): ShownTab => ({
  id,
  label: id,
  icon: 'list',
  search: '',
  plugin,
  ...(only ? { only } : {})
})

const playlists = tab('playlists', 'core')
const files = [tab('songs', 'files', 'sidebar'), tab('albums', 'files')]
const radio = [tab('radio', 'radio')]
const ids = (t: ShownTab[]): string[] => t.map((t) => t.id)

describe('the tab order', () => {
  it('puts Playlists after the first plugin tabs', () => {
    expect(ids(orderTabs([files, radio], playlists))).toEqual([
      'songs',
      'albums',
      'playlists',
      'radio'
    ])
    expect(ids(orderTabs([radio], playlists))).toEqual(['radio', 'playlists'])
  })

  it('has no tabs, Playlists too, with no plugin on', () => {
    expect(orderTabs([], playlists)).toEqual([])
  })

  it('leaves out a tab another library shows', () => {
    const all = orderTabs([files, radio], playlists)
    expect(ids(tabsIn(all, 'chips'))).toEqual(['albums', 'playlists', 'radio'])
    expect(ids(tabsIn(all, 'sidebar'))).toEqual(ids(all))
  })
})
