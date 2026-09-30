// The queue and position, saved in queue.json so a restart carries on where you left off.
import { isStationId } from './stations'

export interface SavedQueue {
  items: string[]
  index: number
  from: string
  // seconds into the current song
  pos: number
  // songs right after the current one put there with "Play next" (ticket 037)
  next?: number
  // radio was playing (ticket 027): it comes back with this station, paused.
  // The queue waits with its list and place.
  kind?: 'radio'
  station?: string
}

// What plays: sent on its own when it changes.
export type SavedPlaying = { kind: 'queue' } | { kind: 'radio'; station: string }

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
  const radio = raw.kind === 'radio' && isStationId(raw.station)
  const playing = radio ? { kind: 'radio' as const, station: raw.station as string } : {}
  const items = raw.items.filter((t): t is string => typeof t === 'string' && t.length > 0)
  if (!items.length) return { ...emptyQueue(), ...playing }
  const index =
    typeof raw.index === 'number' && Number.isInteger(raw.index)
      ? Math.min(items.length - 1, Math.max(0, raw.index))
      : 0
  const pos = typeof raw.pos === 'number' && Number.isFinite(raw.pos) ? Math.max(0, raw.pos) : 0
  const from = typeof raw.from === 'string' ? raw.from.slice(0, 500) : ''
  const next = isCount(raw.next) ? Math.min(raw.next, items.length - 1 - index) : 0
  return { items, index, from, pos, ...(next > 0 ? { next } : {}), ...playing }
}

// Sets what plays, keeping the list and place. Returns the same object when
// nothing changed or the message is bad.
export function applyPlaying(q: SavedQueue, raw: unknown): SavedQueue {
  if (!isObject(raw)) return q
  if (raw.kind === 'queue') {
    if (!q.kind && !q.station) return q
    const rest = { ...q }
    delete rest.kind
    delete rest.station
    return rest
  }
  if (raw.kind !== 'radio' || !isStationId(raw.station)) return q
  if (q.kind === 'radio' && q.station === raw.station) return q
  return { ...q, kind: 'radio', station: raw.station }
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
  // Play next songs after it; left out for none
  next?: number
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

// Moves the saved queue to a new place. Returns the same object when nothing
// changed or the message is bad (an index outside the list, a broken position).
export function applyPlace(q: SavedQueue, raw: unknown): SavedQueue {
  if (!isObject(raw) || !q.items.length) return q
  const { index, pos } = raw
  if (typeof index !== 'number' || !Number.isInteger(index)) return q
  if (index < 0 || index >= q.items.length) return q
  if (typeof pos !== 'number' || !Number.isFinite(pos) || pos < 0) return q
  const next = raw.next ?? 0
  if (next !== 0 && (!isCount(next) || index + next >= q.items.length)) return q
  if (index === q.index && pos === q.pos && next === (q.next ?? 0)) return q
  const moved = { ...q, index, pos }
  if (next) moved.next = next
  else delete moved.next
  return moved
}
