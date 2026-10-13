// Mini's right-click menu (ticket 110). Main draws it, since a menu in the
// page could not go past the 72px bar.
import type { TemplateId } from '../../../shared/layout'
import type { PopupItem } from '../../../shared/ipc'
import type { SleepPick } from '../../../shared/sleep'
import { templateIds, templates } from '../../../shared/templates'
import { sleepId, type ButtonAction } from '../queue/bar'
import { pickOf, sleepRows, type SleepSet } from '../queue/sleep'

export type MiniPick =
  | { layout: TemplateId }
  | { act: string }
  | { sleep: SleepPick | null }
  | 'pin'
  | 'settings'
  | 'minimize'
  | 'quit'

// What plays: the bar's buttons, which a narrow bar has no room for. The
// moon is a Sleep timer submenu, the rest a row each (ticked if they stay
// pressed). One at work is left out, as its click would do nothing.
export interface MiniSong {
  buttons: ButtonAction[]
  sleep: SleepSet | undefined
  live: boolean
  shuffle: boolean
}

function songRows(song: MiniSong | undefined): PopupItem[] {
  if (!song) return []
  return song.buttons.flatMap((a): PopupItem[] => {
    if (a.id === sleepId) return [{ label: 'Sleep timer', items: sleepRows(song.sleep, song) }]
    if (a.busy) return []
    const id = `act:${a.id}`
    return [a.on === undefined ? { id, label: a.label } : { id, label: a.label, checked: a.on }]
  })
}

export function miniMenuItems(current: TemplateId, onTop: boolean, song?: MiniSong): PopupItem[] {
  const playing = songRows(song)
  return [
    ...templateIds.map((id) => ({
      id: `layout:${id}`,
      label: templates[id].name,
      checked: id === current
    })),
    'line',
    ...(playing.length ? [...playing, 'line' as const] : []),
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
  if (id?.startsWith('act:') && id.length > 4) return { act: id.slice(4) }
  const sleep = pickOf(id)
  if (sleep !== undefined) return { sleep }
  const layout = id?.startsWith('layout:') ? id.slice(7) : undefined
  return templateIds.find((t) => t === layout) ? { layout: layout as TemplateId } : undefined
}
