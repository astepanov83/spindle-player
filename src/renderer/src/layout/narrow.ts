// A queue Column in a narrow window: the library would get too thin, so the
// queue is drawn as a Drawer instead. The setting stays Column (ticket 043).
import type { QueueMode, Template, TemplateNode } from '../../../shared/layout'

// Two album tiles side by side in Studio. Studio at its first size (1100px)
// leaves 408px with a Column, so the Column still shows there.
export const minLibraryWidth = 400

// A fixed px size, or null for "1fr" and content-sized nodes
function fixedPx(n: TemplateNode, queueMode: QueueMode): number | null {
  const size = 'queueColumn' in n ? (queueMode === 'col' ? n.queueColumn : null) : n.size
  return size?.endsWith('px') ? parseFloat(size) : null
}

// A queue column exists only as a Column; everything else is always drawn.
function shown(n: TemplateNode, queueMode: QueueMode): boolean {
  return !('queueColumn' in n) || queueMode === 'col'
}

function widthIn(n: TemplateNode, width: number, queueMode: QueueMode): number | null {
  if ('part' in n) return n.part === 'library' ? width : null
  if ('queue' in n) return widthIn(n.queue.with, width, queueMode)
  if ('col' in n) {
    for (const kid of n.col) {
      const w = widthIn(kid, width, queueMode)
      if (w !== null) return w
    }
    return null
  }
  if ('row' in n) {
    const kids = n.row.filter((k) => shown(k, queueMode))
    // a 1px line between parts (Node.svelte)
    let rest = width - (kids.length - 1)
    let shares = 0
    for (const k of kids) {
      const px = fixedPx(k, queueMode)
      if (px !== null) rest -= px
      else if (k.size === '1fr') shares++
    }
    for (const k of kids) {
      const own = fixedPx(k, queueMode) ?? (k.size === '1fr' ? rest / shares : 0)
      const w = widthIn(k, own, queueMode)
      if (w !== null) return w
    }
    return null
  }
  return null
}

// How wide the library part is in a window this wide, or null without one.
export function libraryWidth(t: Template, queueMode: QueueMode, width: number): number | null {
  return widthIn(t.layout, width, queueMode)
}

// What is drawn for the queue setting. width 0: not measured yet.
export function shownQueueMode(t: Template, setting: QueueMode, width: number): QueueMode {
  if (setting !== 'col' || !width || !t.queueOptions.includes('drawer')) return setting
  const lib = libraryWidth(t, 'col', width)
  return lib !== null && lib < minLibraryWidth ? 'drawer' : 'col'
}
