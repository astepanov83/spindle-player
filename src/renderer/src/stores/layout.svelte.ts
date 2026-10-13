// The built layout plus what is open in it. Rebuilds only when the template
// or the queue that is drawn changes; track changes only update the parts.
import type { QueueMode, ShownQueue, TemplateId } from '../../../shared/layout'
import { queueModeFor, visualizerStyles, type VisualizerStyle } from '../../../shared/settings'
import { templates } from '../../../shared/templates'
import {
  buildLayout,
  partsOf,
  placesOf,
  type BuiltLayout,
  type Place,
  type Shown,
  type Slots
} from '../layout/build'
import { shownQueueMode } from '../layout/narrow'
import { isWide } from '../layout/wide'
import { lyrics } from './lyrics.svelte'
import { settings } from './settings.svelte'

class LayoutStore {
  template = $derived(templates[settings.template])
  // the page's width, so a narrow window builds its Drawer from the start;
  // 0 (not known) outside a page
  width = $state(typeof window === 'undefined' ? 0 : window.innerWidth)
  height = $state(typeof window === 'undefined' ? 0 : window.innerHeight)
  // what Settings shows and saves
  queueSetting: ShownQueue = $derived(
    queueModeFor(this.template, settings.queue[settings.template])
  )
  // what is drawn: a Column is a Drawer while the window is too narrow for it
  queueMode: ShownQueue = $derived(shownQueueMode(this.template, this.queueSetting, this.width))
  // a wide, short window: the template's wide layout, if it has one
  wide: boolean = $derived(isWide(this.template, this.width, this.height))
  built: BuiltLayout = $derived(buildLayout(this.template, this.queueMode, this.wide))
  // Focus has none: links to an album or artist are plain text there (ticket 040)
  hasLibrary: boolean = $derived(partsOf(this.built.root).some((p) => p.part === 'library'))
  // The song's words are shown in the stage's place (Studio's panel, ticket
  // 120), so a new visualizer style would not be seen.
  wordsOverStage: boolean = $derived(
    lyrics.showing &&
      lyrics.hasWords &&
      partsOf(this.built.root).some(
        (p) => p.part === 'nowplaying' && p.opts.style === 'panel' && !!p.opts.lyrics
      )
  )
  // Mini: no title bar, and no room for Settings or the close question
  bar: boolean = $derived(this.template.titleBar === false)
  // Mini shows its controls in place of the song's text while the pointer is
  // on it (main says, see App.svelte) or a key moved the focus into it
  barHot = $state(false)
  // Focus with the setting on: its tabs, controls and title bar fade while
  // nobody uses it (layout/idle.ts)
  idleHides: boolean = $derived(!!this.template.idleHide && settings.focusHide)
  get slots(): Slots {
    return this.built.slots
  }

  // drawer open
  showQueue = $state(false)
  // 0: the first tab, 1: Queue
  tabSel = $state(0)
  // the Settings page's section while it is open, else null
  // (components/settings-sections.ts)
  settingsAt: string | null = $state(null)
  // the section it opens on next, the last one shown
  #lastSection = 'general'
  get settingsOpen(): boolean {
    return this.settingsAt !== null
  }
  // the short "Spectrum" label on the stage after a style change
  vzLabel = $state(false)
  #vzTimer: ReturnType<typeof setTimeout> | undefined

  #reset(): void {
    this.showQueue = false
    this.tabSel = 0
  }

  // what had focus before Settings opened; it gets it back on close
  settingsOpener: HTMLElement | null = null

  // `section`: where the opener knows to go, else where it was last
  openSettings(section?: string): void {
    // Mini has no room for it: Settings opens in the big layout
    if (this.bar) this.toBig()
    if (!this.settingsOpen && typeof document !== 'undefined') {
      const at = document.activeElement
      this.settingsOpener = at instanceof HTMLElement && at !== document.body ? at : null
    }
    this.settingsAt = section ?? this.#lastSection
  }

  closeSettings(): void {
    if (this.settingsAt !== null) this.#lastSection = this.settingsAt
    this.settingsAt = null
  }

  toggleSettings(section?: string): void {
    if (this.settingsOpen) this.closeSettings()
    else this.openSettings(section)
  }

  // The library keeps its place, search text and history (library.showIn).
  chooseTemplate(id: TemplateId): void {
    if (id === settings.template) return
    // Mini goes back to the layout it was left for
    if (templates[id].titleBar === false && !this.bar) settings.bigTemplate = settings.template
    // the Settings page has no room in Mini
    if (templates[id].titleBar === false) this.closeSettings()
    settings.template = id
    this.#reset()
  }

  // Mini's button, a double click on it, and its menu's Settings
  toBig(): void {
    this.chooseTemplate(settings.bigTemplate)
  }

  chooseQueueMode(mode: QueueMode): void {
    settings.queue[settings.template] = mode
    this.#reset()
  }

  // An open drawer closes when it turns back into a Column, so it does not
  // come back open on the next narrow resize. The Column shows the queue anyway.
  // It closes on a switch to or from the wide layout too, which builds a new one.
  resized(width: number, height: number): void {
    const was = this.queueMode
    const wasWide = this.wide
    this.width = width
    this.height = height
    if (this.queueMode !== was || this.wide !== wasWide) this.showQueue = false
  }

  chooseVisualizer(v: VisualizerStyle): void {
    settings.visualizer = v
    this.vzLabel = true
    clearTimeout(this.#vzTimer)
    this.#vzTimer = setTimeout(() => (this.vzLabel = false), 1200)
  }

  cycleVisualizer(): void {
    const i = visualizerStyles.indexOf(settings.visualizer)
    this.chooseVisualizer(visualizerStyles[(i + 1) % visualizerStyles.length])
  }

  // The visualizer button and the V key. While the queue or the words cover
  // the stage the first press brings it back, so it shows something; the
  // next ones change the style.
  pressVisualizer(): void {
    const revealed = this.#reveal('stage')
    if (this.wordsOverStage) lyrics.setShown(false)
    else if (!revealed) this.cycleVisualizer()
  }

  // The Lyrics button. Words the queue hides come into view, on, and stay on.
  pressLyrics(): void {
    if (this.#reveal('lyrics')) lyrics.setShown(true)
    else lyrics.toggle()
  }

  #seen(p: Place): boolean {
    return !(p.tab && this.tabSel === 1) && !(p.drawer && this.showQueue)
  }

  // The queue hides every place `what` is drawn (the Queue tab, an open
  // drawer): a change there would not be seen.
  hides(what: Shown): boolean {
    const places = placesOf(this.built.root, what)
    return places.length > 0 && !places.some((p) => this.#seen(p))
  }

  // Shows the first place the queue hides; false when one is in view already.
  #reveal(what: Shown): boolean {
    if (!this.hides(what)) return false
    const p = placesOf(this.built.root, what)[0]
    if (p.tab) this.tabSel = 0
    if (p.drawer) this.showQueue = false
    return true
  }

  // Q key and the slot button: Tab switches tabs, Drawer opens or closes
  // Shows the queue, where it is a tab or a drawer.
  openQueue(): void {
    if (this.queueMode === 'tab') this.tabSel = 1
    else if (this.queueMode === 'drawer') this.showQueue = true
  }

  toggleQueue(): void {
    if (this.queueMode === 'tab') this.tabSel = this.tabSel ? 0 : 1
    else if (this.queueMode === 'drawer') this.showQueue = !this.showQueue
  }
}

export const layout = new LayoutStore()
