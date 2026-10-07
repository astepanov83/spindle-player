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
  },
  // Stacked, a wide and short window leaves the stage only the height that the
  // tabs, words and controls don't take. Beside them it gets the full height.
  wide: {
    ratio: 1.4,
    minWidth: 900,
    layout: {
      row: [
        { part: 'nowplaying', opts: { style: 'full', show: 'stage' }, size: '1fr' },
        {
          col: [
            {
              queue: {
                with: { part: 'nowplaying', opts: { style: 'full', show: 'text' } },
                label: 'Now playing'
              },
              size: '1fr',
              // over the words, like the Queue tab; the controls stay
              drawerHost: 'fill'
            },
            { part: 'controls', opts: { style: 'stack' } }
          ],
          size: 'clamp(420px, 40%, 620px)'
        }
      ],
      look: 'ambient',
      contentWidth: '560px'
    }
  }
}
