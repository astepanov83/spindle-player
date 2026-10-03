// MFP's blocks in Settings: the status line (the episodes and when they came,
// or what went wrong), and a button that reads the site again.
import type { MfpStatus } from '../../../../shared/plugins/mfp/mfp'
import type { SettingBlock } from '../types'
import { mfp } from './store.svelte'

const n = (x: number): string => x.toLocaleString('en-US')
const plural = (x: number, one: string, many: string): string => `${n(x)} ${x === 1 ? one : many}`

// Whole calendar days from `then` to `now`, in local time.
function daysAgo(then: number, now: number): number {
  const start = (t: number): number => {
    const d = new Date(t)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  return Math.round((start(now) - start(then)) / (24 * 3600 * 1000))
}

// The status line, also over the list while the site is read (ticket 052).
export function mfpLine(m: MfpStatus | undefined, now: number): string | undefined {
  if (!m) return undefined
  const site = 'musicforprogramming.net'
  const count = plural(m.episodes, 'episode', 'episodes')
  if (m.running) return m.episodes ? `${count}, looking for new ones…` : `Reading ${site}…`
  const parts: string[] = []
  if (m.episodes) {
    const d = daysAgo(m.fetchedAt, now)
    const when = d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${n(d)} days ago`
    parts.push(`${count}, updated ${when}`)
  }
  if (m.error) parts.push(`Could not read ${site}: ${m.error}`)
  return parts.join(' · ') || undefined
}

const refreshId = 'refresh'

// Nothing before main said MFP is on. Reading the site again is MFP's own
// button, not the music folders' Rescan: MFP works with music files off.
export function mfpSettings(now = Date.now()): SettingBlock[] {
  const m = mfp.status
  if (!m) return []
  const text = mfpLine(m, now)
  return [
    ...(text ? [{ kind: 'status', text, busy: m.running } as const] : []),
    { kind: 'button', id: refreshId, label: 'Check for new episodes', disabled: m.running }
  ]
}

export function mfpActSetting(id: string, actionId: string): void {
  if (id === refreshId && actionId === 'press') window.mfpApi.refresh()
}
