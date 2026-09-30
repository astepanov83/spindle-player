import type { VisualizerStyle } from '../../../shared/settings'

// Each style's name, as Settings lists it.
export const vzNames: Record<VisualizerStyle, string> = {
  ring: 'Ring',
  spectrum: 'Spectrum',
  wave: 'Wave',
  off: 'Off'
}

// "Visualizer: Ring", or "Visualizer off": the tooltip on its button and on
// the bar's small stage.
export function vzLabel(style: VisualizerStyle): string {
  return style === 'off' ? 'Visualizer off' : `Visualizer: ${vzNames[style]}`
}
