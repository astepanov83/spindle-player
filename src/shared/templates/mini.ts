import type { Template } from '../layout'

// A bar to keep next to an editor or a browser: the cover, the title and
// play. No title bar; it stays on top while its pin is on.
export const mini: Template = {
  id: 'mini',
  name: 'Mini',
  window: { width: 360, height: 72, minWidth: 280, minHeight: 64, maxHeight: 96, onTop: true },
  queueOptions: [],
  titleBar: false,
  layout: {
    row: [
      { part: 'nowplaying', opts: { style: 'line' }, size: '1fr' },
      { part: 'controls', opts: { style: 'compact' } }
    ],
    look: 'ambient'
  }
}
