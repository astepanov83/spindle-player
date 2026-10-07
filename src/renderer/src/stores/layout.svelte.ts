// The built layout plus what is open in it. Rebuilds only when the template
// or the queue that is drawn changes; track changes only update the parts.
import type { QueueMode, TemplateId } from '../../../shared/layout'
import { queueModeFor, visualizerStyles, type VisualizerStyle } from '../../../shared/settings'
import { templates } from '../../../shared/templates'
import { buildLayout, partsOf, type BuiltLayout, type Slots } from '../layout/build'
import { shownQueueMode } from '../layout/narrow'
import { isWide } from '../layout/wide'
import { library } from './library.svelte'
import { settings } from './settings.svelte'

class LayoutStore {
  template = $derived(templates[settings.template])
  // the page's width, so a narrow window builds its Drawer from the start;
  // 0 (not known) outside a page
  width = $state(typeof window === 'undefined' ? 0 : window.innerWidth)
  height = $state(typeof window === 'undefined' ? 0 : window.innerHeight)
  // what Settings shows and saves
  queueSetting: QueueMode = $derived(queueModeFor(this.template, settings.queue[settings.template]))
  // what is drawn: a Column is a Drawer while the window is too narrow for it
  queueMode: QueueMode = $derived(shownQueueMode(this.template, this.queueSetting, this.width))
  // a wide, short window: the template's wide layout, if it has one
  wide: boolean = $derived(isWide(this.template, this.width, this.height))
  built: BuiltLayout = $derived(buildLayout(this.template, this.queueMode, this.wide))
  // Focus has none: links to an album or artist are plain text there (ticket 040)
  hasLibrary: boolean = $derived(partsOf(this.built.root).some((p) => p.part === 'library'))
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

  chooseTemplate(id: TemplateId): void {
    settings.template = id
    library.templateChanged()
    this.#reset()
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

  // Q key and the slot button: Tab switches tabs, Drawer opens or closes
  toggleQueue(): void {
    if (this.queueMode === 'tab') this.tabSel = this.tabSel ? 0 : 1
    else if (this.queueMode === 'drawer') this.showQueue = !this.showQueue
  }
}

export const layout = new LayoutStore()
