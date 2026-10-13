// The layout store: what a template change resets and keeps.
import { beforeEach, describe, expect, it } from 'vitest'

const { layout } = await import('./layout.svelte')
const { library } = await import('./library.svelte')
const { lyrics } = await import('./lyrics.svelte')
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
    layout.resized(1200, 680)
    layout.showQueue = false
  })

  it('is drawn as a Drawer while narrow; the setting stays Column', () => {
    layout.resized(860, 680)
    expect(layout.queueMode).toBe('drawer')
    expect(layout.queueSetting).toBe('col')
    expect(settings.queue.studio).toBe('col')
    expect(layout.built.slots['player.buttons']).toEqual([
      { act: 'lyrics', label: 'Lyrics' },
      { act: 'queue', label: 'Show queue' }
    ])
  })

  it('goes back to a Column when wide again, and an open drawer closes', () => {
    layout.resized(860, 680)
    layout.toggleQueue()
    expect(layout.showQueue).toBe(true)
    layout.resized(1200, 680)
    expect(layout.queueMode).toBe('col')
    expect(layout.showQueue).toBe(false)
    // and it does not come back open on the next narrow resize
    layout.resized(860, 680)
    expect(layout.showQueue).toBe(false)
  })

  it('keeps an open drawer through resizes that change nothing drawn', () => {
    layout.resized(860, 680)
    layout.toggleQueue()
    layout.resized(900, 680)
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

describe('Focus on a wide window (ticket 079)', () => {
  beforeEach(() => {
    settings.template = 'focus'
    settings.queue.focus = 'drawer'
    layout.resized(440, 680)
    layout.showQueue = false
  })

  it('builds the wide layout when wide and short, and the stacked one again when not', () => {
    expect(layout.built.wide).toBe(false)
    layout.resized(1600, 600)
    expect(layout.wide).toBe(true)
    expect(layout.built.wide).toBe(true)
    layout.resized(800, 700)
    expect(layout.built.wide).toBe(false)
  })

  it('a taller window goes back to stacked, with the same width', () => {
    layout.resized(1200, 760)
    expect(layout.wide).toBe(true)
    layout.resized(1200, 900)
    expect(layout.wide).toBe(false)
  })

  it('an open drawer closes on a switch, and stays open through resizes that keep the layout', () => {
    layout.resized(1600, 600)
    layout.toggleQueue()
    layout.resized(1600, 700)
    expect(layout.showQueue).toBe(true)
    layout.resized(800, 700)
    expect(layout.showQueue).toBe(false)
  })

  it('Studio never switches', () => {
    settings.template = 'studio'
    layout.resized(2400, 700)
    expect(layout.wide).toBe(false)
    expect(layout.built.wide).toBe(false)
  })
})

describe('Mini (ticket 110)', () => {
  beforeEach(() => {
    layout.closeSettings()
    settings.bigTemplate = 'studio'
  })

  it('goes back to the layout it was left for', () => {
    settings.template = 'focus'
    layout.chooseTemplate('mini')
    expect([settings.template, settings.bigTemplate, layout.bar]).toEqual(['mini', 'focus', true])
    layout.toBig()
    expect([settings.template, layout.bar]).toEqual(['focus', false])
  })

  it('keeps the way back when switching from Mini to Mini or by the key', () => {
    settings.template = 'classic'
    layout.chooseTemplate('mini')
    layout.chooseTemplate('mini')
    expect(settings.bigTemplate).toBe('classic')
  })

  it('has no queue, no drawer button and no title bar', () => {
    settings.template = 'mini'
    expect([layout.queueSetting, layout.queueMode]).toEqual(['none', 'none'])
    expect(layout.slots['player.buttons']).toEqual([])
    expect(layout.hasLibrary).toBe(false)
    layout.toggleQueue()
    expect([layout.showQueue, layout.tabSel]).toEqual([false, 0])
  })

  it('opens Settings in the big layout, and closes it on the way to Mini', () => {
    settings.template = 'classic'
    layout.chooseTemplate('mini')
    layout.openSettings('keys')
    expect([settings.template, layout.settingsAt]).toEqual(['classic', 'keys'])
    layout.chooseTemplate('mini')
    expect([settings.template, layout.settingsOpen]).toEqual(['mini', false])
  })
})

describe('Focus hides its controls (ticket 113)', () => {
  it('only Focus, and only with the setting on', () => {
    settings.focusHide = false
    settings.template = 'focus'
    expect(layout.idleHides).toBe(false)
    settings.focusHide = true
    expect(layout.idleHides).toBe(true)
    layout.resized(1600, 600)
    expect([layout.wide, layout.idleHides]).toEqual([true, true])
    layout.resized(440, 680)
    for (const id of ['studio', 'classic', 'mini'] as const) {
      settings.template = id
      expect(layout.idleHides).toBe(false)
    }
    settings.focusHide = false
  })
})

// Studio's words take the stage's place (ticket 120): a new style would not
// be seen, so the button brings the stage back first.
describe('the visualizer button over the words', () => {
  beforeEach(() => {
    settings.template = 'studio'
    settings.visualizer = 'ring'
    lyrics.words = { synced: [{ t: 0, text: 'One' }] }
    lyrics.setShown(true)
  })

  it('hides the words first, then changes the style', () => {
    expect(layout.wordsOverStage).toBe(true)
    layout.pressVisualizer()
    expect([lyrics.shown, settings.visualizer]).toEqual([false, 'ring'])
    expect(layout.wordsOverStage).toBe(false)
    layout.pressVisualizer()
    expect(settings.visualizer).not.toBe('ring')
  })

  it('changes the style where the words leave the stage in view', () => {
    settings.template = 'focus'
    lyrics.setShown(true)
    expect(layout.wordsOverStage).toBe(false)
    layout.pressVisualizer()
    expect([lyrics.shown, settings.visualizer]).toEqual([true, expect.not.stringMatching('ring')])
  })

  it('changes the style for a song with no words', () => {
    lyrics.words = undefined
    expect(layout.wordsOverStage).toBe(false)
    layout.pressVisualizer()
    expect(settings.visualizer).not.toBe('ring')
  })
})
