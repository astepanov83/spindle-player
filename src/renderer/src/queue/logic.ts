// Queue moves as plain functions. See work/specs/queue.md.
// Ticket 007 puts real playback behind them.

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
  if (q.index + 1 >= items.length) items = [...items, ...o.nextAlbum(items[items.length - 1])]
  if (q.index + 1 >= items.length) return q
  return { ...q, items, index: q.index + 1 }
}

// Previous restarts the song after 3s, otherwise goes one back.
export function back(q: QueueState, pos: number): { state: QueueState; restart: boolean } {
  if (pos > 3 || q.index === 0) return { state: q, restart: true }
  return { state: { ...q, index: q.index - 1 }, restart: false }
}
