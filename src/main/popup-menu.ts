// A menu main draws for the page (WinApi.popupMenu). A page menu can't go
// past the window's edge, and Mini is only 72px tall.
import type { MenuItemConstructorOptions } from 'electron'
import type { PopupItem } from '../shared/ipc'

// Rows a menu could hold, its submenus' rows too; a page can't send more.
const maxItems = 40

// The page's rows; anything else drops the whole menu. "&" is doubled on
// Windows and Linux, where one marks a shortcut key (as in tray.ts).
export function parsePopupItems(raw: unknown, platform = process.platform): PopupItem[] | null {
  let count = 0
  const label = (v: unknown): string | null => {
    if (typeof v !== 'string' || !v || v.length > 200) return null
    return platform === 'darwin' ? v : v.replaceAll('&', '&&')
  }
  const rows = (raw: unknown, sub: boolean): PopupItem[] | null => {
    if (!Array.isArray(raw) || !raw.length) return null
    count += raw.length
    if (count > maxItems) return null
    const out: PopupItem[] = []
    for (const r of raw) {
      if (r === 'line') {
        out.push('line')
        continue
      }
      if (typeof r !== 'object' || r === null) return null
      const { id, label: l, checked, items } = r as Record<string, unknown>
      const text = label(l)
      if (!text) return null
      // a submenu holds plain rows only
      if (items !== undefined) {
        const inner = sub ? null : rows(items, true)
        if (!inner) return null
        out.push({ label: text, items: inner })
        continue
      }
      if (typeof id !== 'string' || !id || id.length > 100) return null
      if (checked !== undefined && typeof checked !== 'boolean') return null
      out.push(checked === undefined ? { id, label: text } : { id, label: text, checked })
    }
    return out
  }
  return rows(raw, false)
}

// A checked row is a check box, so it shows its tick when off too.
export function popupTemplate(
  items: PopupItem[],
  pick: (id: string) => void
): MenuItemConstructorOptions[] {
  return items.map((it) =>
    it === 'line'
      ? { type: 'separator' }
      : 'items' in it
        ? { label: it.label, submenu: popupTemplate(it.items, pick) }
        : {
            label: it.label,
            ...(it.checked === undefined ? {} : { type: 'checkbox', checked: it.checked }),
            click: () => pick(it.id)
          }
  )
}
