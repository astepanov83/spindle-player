import type { Template } from '../layout'

export const focus: Template = {
  id: 'focus',
  name: 'Focus',
  window: { width: 440, height: 680, minWidth: 380, minHeight: 560 },
  queueOptions: ['tab', 'drawer'],
  layout: {
    col: [
      {
        queue: { with: { part: 'nowplaying', opts: { style: 'full' } }, label: 'Now playing' },
        size: '1fr',
        drawerHost: true
      },
      { part: 'controls', opts: { style: 'stack' } }
    ],
    look: 'ambient',
    // on a wide window the tabs, words and controls stay this wide, in the middle
    contentWidth: '560px'
  }
}
