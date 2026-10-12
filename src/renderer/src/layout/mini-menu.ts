// Mini's right-click menu (ticket 110). Main draws it, since a menu in the
// page could not go past the 72px bar.
import type { TemplateId } from '../../../shared/layout'
import type { PopupItem } from '../../../shared/ipc'
import { templateIds, templates } from '../../../shared/templates'

export type MiniPick = { layout: TemplateId } | 'pin' | 'settings' | 'minimize' | 'quit'

export function miniMenuItems(current: TemplateId, onTop: boolean): PopupItem[] {
  return [
    ...templateIds.map((id) => ({
      id: `layout:${id}`,
      label: templates[id].name,
      checked: id === current
    })),
    'line',
    { id: 'pin', label: 'Keep on top', checked: onTop },
    'line',
    { id: 'settings', label: 'Settings' },
    { id: 'minimize', label: 'Minimize' },
    { id: 'quit', label: 'Quit' }
  ]
}

// The row main says was picked; nothing for none or one this menu doesn't have.
export function miniPick(id: string | null): MiniPick | undefined {
  if (id === 'pin' || id === 'settings' || id === 'minimize' || id === 'quit') return id
  const layout = id?.startsWith('layout:') ? id.slice(7) : undefined
  return templateIds.find((t) => t === layout) ? { layout: layout as TemplateId } : undefined
}
