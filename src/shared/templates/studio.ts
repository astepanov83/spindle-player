import type { Template } from '../layout'

export const studio: Template = {
  id: 'studio',
  name: 'Studio',
  window: { width: 1100, height: 680, minWidth: 860, minHeight: 560 },
  queueOptions: ['tab', 'drawer', 'col'],
  layout: {
    row: [
      { part: 'library', opts: { nav: 'chips' }, size: '1fr', drawerHost: true },
      {
        col: [
          {
            queue: { with: { part: 'nowplaying', opts: { style: 'panel' } }, label: 'Now playing' },
            size: '1fr'
          },
          { part: 'controls', opts: { style: 'stack' } }
        ],
        size: '380px',
        look: 'tint'
      },
      { queueColumn: '310px' }
    ]
  }
}
