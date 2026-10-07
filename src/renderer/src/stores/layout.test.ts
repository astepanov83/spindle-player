// The layout store: what a template change resets and keeps.
import { beforeEach, describe, expect, it } from 'vitest'

const { layout } = await import('./layout.svelte')
const { library } = await import('./library.svelte')
const { settings } = await import('./settings.svelte')

// The library keeps its place, search text and history; Studio and Classic
// swap histories in library.showIn (ticket 078).
describe('choosing a template', () => {
  it('keeps the search text and the history: a trip to Focus loses nothing', () => {
    settings.template = 'studio'
    library.go({ tab: 'radio' })
    library.query = 'jazz'
    layout.chooseTemplate('focus')
    layout.chooseTemplate('studio')
    expect(settings.template).toBe('studio')
    expect([library.tab, library.query, library.canBack]).toEqual(['radio', 'jazz', true])
  })

  it('closes the drawer and goes to the first tab', () => {
    settings.template = 'studio'
    layout.showQueue = true
    layout.tabSel = 1
    layout.chooseTemplate('classic')
    expect([layout.showQueue, layout.tabSel]).toEqual([false, 0])
  })

  it('does nothing for the template shown', () => {
    settings.template = 'studio'
    layout.tabSel = 1
    layout.chooseTemplate('studio')
    expect(layout.tabSel).toBe(1)
  })
})

describe('a Column in a narrow window (ticket 043)', () => {
  beforeEach(() => {
    settings.template = 'studio'
    settings.queue.studio = 'col'
    layout.resized(1200)
    layout.showQueue = false
  })

  it('is drawn as a Drawer while narrow; the setting stays Column', () => {
    layout.resized(860)
    expect(layout.queueMode).toBe('drawer')
    expect(layout.queueSetting).toBe('col')
    expect(settings.queue.studio).toBe('col')
    expect(layout.built.slots['player.buttons']).toEqual([{ act: 'queue', label: 'Show queue' }])
  })

  it('goes back to a Column when wide again, and an open drawer closes', () => {
    layout.resized(860)
    layout.toggleQueue()
    expect(layout.showQueue).toBe(true)
    layout.resized(1200)
    expect(layout.queueMode).toBe('col')
    expect(layout.showQueue).toBe(false)
    // and it does not come back open on the next narrow resize
    layout.resized(860)
    expect(layout.showQueue).toBe(false)
  })

  it('keeps an open drawer through resizes that change nothing drawn', () => {
    layout.resized(860)
    layout.toggleQueue()
    layout.resized(900)
    expect(layout.showQueue).toBe(true)
  })
})

describe('the Settings page (ticket 072)', () => {
  beforeEach(() => layout.closeSettings())

  it('opens on the section its opener names, and where it was last without one', () => {
    expect(layout.settingsOpen).toBe(false)
    layout.openSettings()
    expect(layout.settingsAt).toBe('general')
    layout.settingsAt = 'keys'
    layout.closeSettings()
    expect(layout.settingsOpen).toBe(false)
    layout.openSettings()
    expect(layout.settingsAt).toBe('keys')
    layout.openSettings('layout')
    expect(layout.settingsAt).toBe('layout')
  })

  it('toggles, opening on a section when it was closed', () => {
    layout.toggleSettings('layout')
    expect(layout.settingsAt).toBe('layout')
    layout.toggleSettings('layout')
    expect(layout.settingsOpen).toBe(false)
    layout.toggleSettings()
    expect(layout.settingsAt).toBe('layout')
  })
})
