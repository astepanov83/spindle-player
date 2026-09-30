// The built layout plus what is open in it. Rebuilds only when the template
// or the queue setting changes; track changes only update the parts.
import type { QueueMode, TemplateId } from '../../../shared/layout'
import { queueModeFor, visualizerStyles, type VisualizerStyle } from '../../../shared/settings'
import { templates } from '../../../shared/templates'
import { buildLayout, partsOf, type BuiltLayout, type Slots } from '../layout/build'
import { library } from './library.svelte'
import { settings } from './settings.svelte'

class LayoutStore {
  template = $derived(templates[settings.template])
  queueMode: QueueMode = $derived(queueModeFor(this.template, settings.queue[settings.template]))
  built: BuiltLayout = $derived(buildLayout(this.template, this.queueMode))
  // Focus has none: links to an album or artist are plain text there (ticket 040)
  hasLibrary: boolean = $derived(partsOf(this.built.root).some((p) => p.part === 'library'))
  get slots(): Slots {
    return this.built.slots
  }

  // drawer open
  showQueue = $state(false)
  // 0: the first tab, 1: Queue
  tabSel = $state(0)
  settingsOpen = $state(false)
  // the short "Spectrum" label on the stage after a style change
  vzLabel = $state(false)
  #vzTimer: ReturnType<typeof setTimeout> | undefined

  #reset(): void {
    this.showQueue = false
    this.tabSel = 0
  }

  chooseTemplate(id: TemplateId): void {
    settings.template = id
    library.open = null
    // the other template shows another chip or section: the text was not for it
    library.query = ''
    this.#reset()
  }

  chooseQueueMode(mode: QueueMode): void {
    settings.queue[settings.template] = mode
    this.#reset()
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
