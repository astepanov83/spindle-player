// The order of the library's tabs (spec "Pages and tabs", Tab order).
import { describe, expect, it } from 'vitest'
import { orderTabs, searchLabel, tabsIn, widerSearches, type ShownTab } from './tabs'

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

describe('searching another tab (ticket 077)', () => {
  const wide = (t: ShownTab, search: string): ShownTab => ({ ...t, search, searchWide: true })
  const all = [
    tab('songs', 'files', 'sidebar'),
    wide(tab('albums', 'files'), 'Search your library'),
    tab('artists', 'files'),
    playlists,
    wide(tab('radio', 'radio'), 'Search stations')
  ]

  it('offers each other tab that searches wider, in tab order', () => {
    expect(ids(widerSearches(all, 'artists', 'har'))).toEqual(['albums', 'radio'])
    expect(ids(widerSearches(all, 'playlists', 'har'))).toEqual(['albums', 'radio'])
  })

  it('leaves out the tab shown', () => {
    expect(ids(widerSearches(all, 'albums', 'har'))).toEqual(['radio'])
    expect(ids(widerSearches(all, 'radio', 'har'))).toEqual(['albums'])
  })

  it('offers nothing without text', () => {
    expect(widerSearches(all, 'artists', '  ')).toEqual([])
  })

  it('offers nothing when no other tab searches wider (radio off)', () => {
    expect(widerSearches(all.slice(0, 4), 'albums', 'har')).toEqual([])
  })

  it('names the tab and the text', () => {
    expect(searchLabel(all[4], ' har ')).toBe('Search stations for "har"')
  })
})
