// The files plugin's blocks in Settings: the music folders, Add folder and
// Rescan, and what the scan says. Main owns the list; this only asks.
import { canRescan, statusLines } from '../../library/scan-text'
import { library } from '../../stores/library.svelte'
import type { SettingBlock } from '../types'

export function filesSettings(): SettingBlock[] {
  const s = library.status
  // with settings.json unreadable, main would change the list in memory only
  const locked = !!s.settingsUnreadable
  return [
    { kind: 'title', text: 'Music folders' },
    {
      kind: 'list',
      id: 'folders',
      rows: s.folders.map((f) => ({
        id: f,
        title: f,
        ...(s.missing.includes(f) ? { note: 'not found' } : {})
      })),
      // removing drops the folder's songs and artist names, so it asks first
      remove: 'Remove',
      confirm: 'Remove folder',
      paths: true,
      disabled: locked
    },
    { kind: 'button', id: 'add', label: 'Add folder', disabled: locked },
    { kind: 'button', id: 'rescan', label: 'Rescan', disabled: !canRescan(s, library.loadFailed) },
    ...statusLines(s, library.loadFailed).map((text): SettingBlock => ({ kind: 'status', text }))
  ]
}

export function filesActSetting(id: string, actionId: string, value?: string): void {
  if (id === 'folders' && actionId === 'remove' && value) window.libraryApi.removeFolder(value)
  else if (id === 'add' && actionId === 'press') window.libraryApi.addFolder()
  else if (id === 'rescan' && actionId === 'press') window.libraryApi.rescan()
}
