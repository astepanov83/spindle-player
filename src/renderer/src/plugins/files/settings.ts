// The files plugin's blocks in Settings: the music folders, Add folder and
// Rescan, and what the scan says. Main owns the list; this only asks. Also
// its lines next to the chips and under the cover lookup setting, and the
// artist groups task's place (ticket 068).
import {
  canRescan,
  fetchBusy,
  fetchLine,
  groupsLine,
  photoLine,
  scanLine,
  statusLines
} from './scan-text'
import { files } from './store.svelte'
import { ai } from '../../ai.svelte'
import { artistGroupsTask } from '../../../../shared/plugins/files/artists-file'
import type { SettingBlock } from '../../../../shared/setting-blocks'

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
    ...statusLines(s, files.loadFailed).map((text): SettingBlock => ({ kind: 'status', text })),
    { kind: 'ai', task: artistGroupsTask, blocks: groupsBlocks() }
  ]
}

// The task's own line and button, in its box under the setup, only while it is switched on.
function groupsBlocks(): SettingBlock[] {
  const state = ai.state
  const task = state?.tasks[artistGroupsTask]
  if (!state || !task?.on) return []
  const service = state.providers.find((p) => p.id === state.provider)?.name
  const g = files.status.groups
  const line = groupsLine(g, service)
  const out: SettingBlock[] = []
  if (line) out.push({ kind: 'status', ...line })
  // asking needs the provider ready, not only the switch
  out.push({
    kind: 'button',
    id: 'ai-recheck',
    label: 'Check all names again',
    disabled: !task.ready || g?.state === 'running',
    // every name again is the one big run, so it asks first when it may cost money
    ...(state.paid && { confirm: 'This asks about every artist again and may use credit.' })
  })
  // a greyed button says why
  if (!task.ready)
    out.push({
      kind: 'status',
      text: service ? `Connect ${service} first.` : 'Connect a service first.'
    })
  return out
}

export function filesActSetting(id: string, actionId: string, value?: string): void {
  if (id === 'folders' && actionId === 'remove' && value) window.libraryApi.removeFolder(value)
  else if (id === 'add' && actionId === 'press') window.libraryApi.addFolder()
  else if (id === 'rescan' && actionId === 'press') window.libraryApi.rescan()
  else if (id === 'ai-recheck' && actionId === 'press') window.libraryApi.aiRecheck()
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
