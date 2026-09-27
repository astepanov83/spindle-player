import type { Template } from '../layout'

export const classic: Template = {
  id: 'classic',
  name: 'Classic',
  window: { width: 1100, height: 680, minWidth: 860, minHeight: 560 },
  // no Tab: the bar has no column to share
  queueOptions: ['drawer', 'col'],
  layout: {
    col: [
      {
        row: [{ part: 'library', opts: { nav: 'sidebar' }, size: '1fr' }, { queueColumn: '330px' }],
        size: '1fr',
        drawerHost: true
      },
      { part: 'controls', opts: { style: 'bar' }, size: '96px' }
    ]
  }
}
