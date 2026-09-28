// Queue moves as plain functions. See work/specs/queue.md.
// stores/queue.svelte.ts plays what they pick.

export interface QueueState {
  items: string[]
  index: number
  // shown as "From <from>" in the queue header
  from: string
}

export interface NextOptions {
  shuffle: boolean
  // the next album's songs, to carry on when the queue runs out
  nextAlbum: (lastId: string) => string[]
  // don't add the next album if its songs are already in the queue
  noRepeats?: boolean
  random?: () => number
}

export function advance(q: QueueState, o: NextOptions): QueueState {
  const random = o.random ?? Math.random
  if (o.shuffle && q.items.length > 1) {
    // a random other song
    let i = Math.floor(random() * (q.items.length - 1))
    if (i >= q.index) i++
    return { ...q, index: i }
  }
  let items = q.items
  if (q.index + 1 >= items.length) {
    let more = o.nextAlbum(items[items.length - 1])
    if (o.noRepeats && more.some((id) => items.includes(id))) more = []
    items = [...items, ...more]
  }
  if (q.index + 1 >= items.length) return q
  return { ...q, items, index: q.index + 1 }
}

// What to do when a song ends by itself: repeat replays it, otherwise the
// next song plays; with nothing after it, playback stops.
export type EndStep = { kind: 'replay' } | { kind: 'play'; state: QueueState } | { kind: 'stop' }

export function onEnded(q: QueueState, repeat: boolean, o: NextOptions): EndStep {
  if (repeat) return { kind: 'replay' }
  const next = advance(q, o)
  return next === q ? { kind: 'stop' } : { kind: 'play', state: next }
}

// Clicking a queue row.
export function jump(q: QueueState, index: number): QueueState {
  if (index < 0 || index >= q.items.length || index === q.index) return q
  return { ...q, index }
}

// A song that won't play is skipped, but after `max` failures in a row, or a
// whole queue's worth, playback stops instead of trying every song there is.
export function afterFailure(failsInARow: number, queueLength: number, max = 20): 'skip' | 'stop' {
  return failsInARow >= Math.min(max, queueLength + 1) ? 'stop' : 'skip'
}

// Previous restarts the song after 3s, otherwise goes one back.
export function back(q: QueueState, pos: number): { state: QueueState; restart: boolean } {
  if (pos > 3 || q.index === 0) return { state: q, restart: true }
  return { state: { ...q, index: q.index - 1 }, restart: false }
}

// After a rescan: drops songs that left the library. The current song stays
// current; if it is gone, the next song still there takes its place.
export function prune(q: QueueState, has: (id: string) => boolean): QueueState {
  const items: string[] = []
  let index = -1
  q.items.forEach((id, i) => {
    if (!has(id)) return
    if (index < 0 && i >= q.index) index = items.length
    items.push(id)
  })
  if (items.length === q.items.length) return q
  if (index < 0) index = Math.max(0, items.length - 1)
  return { ...q, items, index }
}
