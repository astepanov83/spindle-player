// The one context menu. Rows open it with a list of items; App.svelte draws it.
export interface MenuItem {
  label: string
  run: () => void
  // shown under a heading, a bit to the right
  indent?: boolean
}

export type MenuEntry = MenuItem | { heading: string } | 'line'

class MenuStore {
  open: { x: number; y: number; entries: MenuEntry[] } | null = $state(null)

  show(x: number, y: number, entries: MenuEntry[]): void {
    this.open = { x, y, entries }
  }

  // At the mouse for a right click, under the button for a click.
  showFor(e: MouseEvent, entries: MenuEntry[]): void {
    e.preventDefault()
    if (e.type === 'contextmenu' || !(e.currentTarget instanceof HTMLElement)) {
      this.show(e.clientX, e.clientY, entries)
    } else {
      const r = e.currentTarget.getBoundingClientRect()
      this.show(r.left, r.bottom + 4, entries)
    }
  }

  close(): void {
    this.open = null
  }
}

export const menu = new MenuStore()
