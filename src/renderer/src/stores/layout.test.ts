// The layout store: what a template change resets.
import { beforeEach, describe, expect, it } from 'vitest'

const { layout } = await import('./layout.svelte')
const { library } = await import('./library.svelte')
const { settings } = await import('./settings.svelte')

describe('choosing a template (ticket 039)', () => {
  it('clears the search text: the other template shows another view', () => {
    settings.template = 'studio'
    library.chip = 'radio'
    library.query = 'jazz'
    layout.chooseTemplate('classic')
    expect(settings.template).toBe('classic')
    expect(library.query).toBe('')
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
