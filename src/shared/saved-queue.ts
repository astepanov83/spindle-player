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

// The file is only a list and a place in it, so any object with a list is known.
export function isKnownQueueFile(raw: unknown): boolean {
  return isObject(raw) && Array.isArray(raw.items)
}

// Where the queue is: the current song and seconds into it. Sent on every song
// change and every few seconds, without the list, which can hold 50k ids.
export interface QueuePlace {
  index: number
  pos: number
}

// Moves the saved queue to a new place. Returns the same object when nothing
// changed or the message is bad (an index outside the list, a broken position).
export function applyPlace(q: SavedQueue, raw: unknown): SavedQueue {
  if (!isObject(raw) || !q.items.length) return q
  const { index, pos } = raw
  if (typeof index !== 'number' || !Number.isInteger(index)) return q
  if (index < 0 || index >= q.items.length) return q
  if (typeof pos !== 'number' || !Number.isFinite(pos) || pos < 0) return q
  if (index === q.index && pos === q.pos) return q
  return { ...q, index, pos }
}
