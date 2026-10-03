// The files plugin's blocks in Settings: the music folders, Add folder and
// Rescan, and what the scan says. Main owns the list; this only asks. Also
// its lines next to the chips and under the cover lookup setting.
import {
  canRescan,
  fetchBusy,
  fetchLine,
  photoLine,
  scanLine,
  statusLines
} from '../../library/scan-text'
import { files } from './store.svelte'
import type { SettingBlock } from '../types'

export function filesSettings(): SettingBlock[] {
  const s = files.status
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
    { kind: 'button', id: 'rescan', label: 'Rescan', disabled: !canRescan(s, files.loadFailed) },
    ...statusLines(s, files.loadFailed).map((text): SettingBlock => ({ kind: 'status', text }))
  ]
}

export function filesActSetting(id: string, actionId: string, value?: string): void {
  if (id === 'folders' && actionId === 'remove' && value) window.libraryApi.removeFolder(value)
  else if (id === 'add' && actionId === 'press') window.libraryApi.addFolder()
  else if (id === 'rescan' && actionId === 'press') window.libraryApi.rescan()
}

// A scan, next to the chips. With no songs yet the empty page shows it instead.
export function filesStatusLine(): string | undefined {
  const s = files.status
  return s.phase !== 'idle' && files.albums.length ? scanLine(s) : undefined
}

// The album cover and artist photo lookup, under "Find missing covers online".
export function filesCoverLines(): { text: string; busy: boolean }[] {
  const f = files.status.fetch
  const busy = fetchBusy(f)
  const out: { text: string; busy: boolean }[] = []
  const covers = fetchLine(f)
  if (covers) out.push({ text: covers, busy: busy === 'covers' })
  const photos = photoLine(f)
  if (photos) out.push({ text: photos, busy: busy === 'photos' })
  return out
}
