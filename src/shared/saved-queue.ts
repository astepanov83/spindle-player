// The queue and position, saved in queue.json so a restart carries on where you left off.

export interface SavedQueue {
  items: string[]
  index: number
  from: string
  // seconds into the current song
  pos: number
}

export function emptyQueue(): SavedQueue {
  return { items: [], index: 0, from: '', pos: 0 }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Anything wrong with the list gives an empty queue; a bad index or position
// is pulled back into range.
export function parseSavedQueue(raw: unknown): SavedQueue {
  if (!isObject(raw) || !Array.isArray(raw.items)) return emptyQueue()
  const items = raw.items.filter((t): t is string => typeof t === 'string' && t.length > 0)
  if (!items.length) return emptyQueue()
  const index =
    typeof raw.index === 'number' && Number.isInteger(raw.index)
      ? Math.min(items.length - 1, Math.max(0, raw.index))
      : 0
  const pos = typeof raw.pos === 'number' && Number.isFinite(raw.pos) ? Math.max(0, raw.pos) : 0
  const from = typeof raw.from === 'string' ? raw.from.slice(0, 500) : ''
  return { items, index, from, pos }
}
