// A menu main draws for the page (WinApi.popupMenu). A page menu can't go
// past the window's edge, and Mini is only 72px tall.
import type { MenuItemConstructorOptions } from 'electron'
import type { PopupItem } from '../shared/ipc'

// Rows a menu could hold; a page can't send more.
const maxItems = 40

// The page's rows; anything else drops the whole menu. "&" is doubled on
// Windows and Linux, where one marks a shortcut key (as in tray.ts).
export function parsePopupItems(raw: unknown, platform = process.platform): PopupItem[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > maxItems) return null
  const out: PopupItem[] = []
  for (const r of raw) {
    if (r === 'line') {
      out.push('line')
      continue
    }
    if (typeof r !== 'object' || r === null) return null
    const { id, label, checked } = r as Record<string, unknown>
    if (typeof id !== 'string' || !id || id.length > 100) return null
    if (typeof label !== 'string' || !label || label.length > 200) return null
    if (checked !== undefined && typeof checked !== 'boolean') return null
    const text = platform === 'darwin' ? label : label.replaceAll('&', '&&')
    out.push(checked === undefined ? { id, label: text } : { id, label: text, checked })
  }
  return out
}

// A checked row is a check box, so it shows its tick when off too.
export function popupTemplate(
  items: PopupItem[],
  pick: (id: string) => void
): MenuItemConstructorOptions[] {
  return items.map((it) =>
    it === 'line'
      ? { type: 'separator' }
      : {
          label: it.label,
          ...(it.checked === undefined ? {} : { type: 'checkbox', checked: it.checked }),
          click: () => pick(it.id)
        }
  )
}
