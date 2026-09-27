import type { QueueMode, Template, TemplateId } from './layout'

export type VisualizerStyle = 'ring' | 'spectrum' | 'wave' | 'off'
export type ThemeChoice = 'system' | 'dark' | 'light'

export interface Settings {
  template: TemplateId
  // per template, so each keeps its own choice
  queue: Record<TemplateId, QueueMode>
  visualizer: VisualizerStyle
  theme: ThemeChoice
}

export const visualizerStyles: VisualizerStyle[] = ['ring', 'spectrum', 'wave', 'off']

export function defaultSettings(): Settings {
  return {
    template: 'studio',
    queue: { studio: 'tab', classic: 'drawer', focus: 'tab' },
    visualizer: 'ring',
    theme: 'system'
  }
}

// A saved choice the template does not offer falls back to its first option.
export function queueModeFor(template: Template, saved: QueueMode | undefined): QueueMode {
  return saved && template.queueOptions.includes(saved) ? saved : template.queueOptions[0]
}
