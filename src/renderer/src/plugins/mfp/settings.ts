// MFP's status line in Settings: the episodes and when they came, or what went wrong.
import { mfpLine } from '../../library/scan-text'
import { library } from '../../stores/library.svelte'
import type { SettingBlock } from '../types'

export function mfpSettings(now = Date.now()): SettingBlock[] {
  const m = library.status.mfp
  const text = mfpLine(m, now)
  return text ? [{ kind: 'status', text, busy: !!m?.running }] : []
}
