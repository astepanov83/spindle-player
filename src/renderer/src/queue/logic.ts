// Queue moves as plain functions. See work/specs/queue.md.
// stores/queue.svelte.ts plays what they pick.
import type { ItemKey } from '../../../shared/plugins/items'
import type { QueueLink } from '../../../shared/saved-queue'
import type { PlayablePart } from '../plugins/types'

export interface QueueState {
  items: ItemKey[]
  index: number
  // shown as "From <from>" in the queue header
  from: string
  // what "From" opens; left out when it opens nothing
  link?: QueueLink
  // How many songs right after the current one were put there with "Play
  // next". Shuffle plays them first, in order. Left out when none.
  next?: number
}

// The state with `next` songs waiting to play next, the field left out for none.
function withNext(q: QueueState, next: number): QueueState {
  const s = { ...q }
  if (next > 0) s.next = next
  else delete s.next
  return s
}

// Which rows are Play next songs, so they can be counted again after an edit.
function nextMarks(q: QueueState): boolean[] {
  const n = q.next ?? 0
  return q.items.map((_, i) => i > q.index && i <= q.index + n)
}

// Play next songs are the marked rows right after the current one.
function countNext(marks: boolean[], index: number): number {
  let n = 0
  while (marks[index + 1 + n]) n++
  return n
}

export interface NextOptions {
  shuffle: boolean
  random?: () => number
}

// The song after the current one. At the end of the queue the same state
// comes back: playback stops there, no other album is added.
export function advance(q: QueueState, o: NextOptions): QueueState {
  const random = o.random ?? Math.random
  const next = q.next ?? 0
  // Play next songs come first, with shuffle too
  if (next > 0) return withNext({ ...q, index: q.index + 1 }, next - 1)
  if (o.shuffle && q.items.length > 1) {
    // a random other song
    let i = Math.floor(random() * (q.items.length - 1))
    if (i >= q.index) i++
    return { ...q, index: i }
  }
  if (q.index + 1 >= q.items.length) return q
  return { ...q, index: q.index + 1 }
}

// What to do when a song ends by itself: repeat replays it, otherwise the
// next song plays; with nothing after it, playback stops.
export type EndStep = { kind: 'replay' } | { kind: 'play'; state: QueueState } | { kind: 'stop' }

export function onEnded(q: QueueState, repeat: boolean, o: NextOptions): EndStep {
  if (repeat) return { kind: 'replay' }
  const next = advance(q, o)
  return next === q ? { kind: 'stop' } : { kind: 'play', state: next }
}

// Clicking a queue row. Play next songs after the clicked one still wait.
export function jump(q: QueueState, index: number): QueueState {
  if (index < 0 || index >= q.items.length || index === q.index) return q
  return withNext({ ...q, index }, countNext(nextMarks(q), index))
}

// An empty queue takes the songs, the first one current.
function filled(items: ItemKey[], from: string, link: QueueLink | undefined): QueueState {
  return link ? { items, index: 0, from, link } : { items, index: 0, from }
}

// "Play next": the songs go right after the current one, before other Play
// next songs. An empty queue takes them, the first one current.
export function insertNext(
  q: QueueState,
  keys: ItemKey[],
  from = '',
  link?: QueueLink
): QueueState {
  if (!keys.length) return q
  if (!q.items.length) return filled(keys, from, link)
  const items = [...q.items.slice(0, q.index + 1), ...keys, ...q.items.slice(q.index + 1)]
  return withNext({ ...q, items }, (q.next ?? 0) + keys.length)
}

// "Add to queue": the songs go at the end.
export function append(q: QueueState, keys: ItemKey[], from = '', link?: QueueLink): QueueState {
  if (!keys.length) return q
  if (!q.items.length) return filled(keys, from, link)
  return { ...q, items: [...q.items, ...keys] }
}

// Takes a row out. When it was the current song, the one after it takes its
// place, or the one before when it was the last.
export function removeRow(q: QueueState, i: number): QueueState {
  if (i < 0 || i >= q.items.length) return q
  if (q.items.length === 1) return { items: [], index: 0, from: '' }
  const items = q.items.filter((_, k) => k !== i)
  const marks = nextMarks(q).filter((_, k) => k !== i)
  let index = i < q.index ? q.index - 1 : q.index
  if (index >= items.length) index = items.length - 1
  return withNext({ ...q, items, index }, countNext(marks, index))
}

// Undo of removeRow: `before` and `after` are the states around it, `now`
// the queue at Undo, with the same rows as `after`. The row goes back at its
// place. A removed current song is current again if no other song was picked
// since (`restart`: it must load again); otherwise what plays now goes on.
export function undoRemove(
  now: QueueState,
  before: QueueState,
  after: QueueState,
  at: number
): { state: QueueState; restart: boolean } {
  const wasCurrent = at === before.index
  if (wasCurrent && now.index === after.index) return { state: before, restart: true }
  const pos = Math.min(at, now.items.length)
  const items = [...now.items.slice(0, pos), before.items[at], ...now.items.slice(pos)]
  const marks = nextMarks(now)
  marks.splice(pos, 0, !wasCurrent && nextMarks(before)[at])
  const index = pos <= now.index ? now.index + 1 : now.index
  return { state: withNext({ ...now, items, index }, countNext(marks, index)), restart: false }
}

// Moves the row at `from` so it ends up at `to`. The current song stays
// current. A row that lands right after it, or among the Play next songs,
// becomes one of them.
export function moveRow(q: QueueState, from: number, to: number): QueueState {
  const n = q.items.length
  if (from === to || from < 0 || from >= n || to < 0 || to >= n) return q
  const order = q.items.map((_, k) => k)
  order.splice(to, 0, order.splice(from, 1)[0])
  const items = order.map((k) => q.items[k])
  const old = nextMarks(q)
  const marks = order.map((k) => old[k])
  const index = order.indexOf(q.index)
  if (from !== q.index && (to === index + 1 || (marks[to - 1] && marks[to + 1]))) marks[to] = true
  return withNext({ ...q, items, index }, countNext(marks, index))
}

// The Clear button: only the current song is left, so what plays goes on.
// A second Clear takes that one out too.
export function clearQueue(q: QueueState): QueueState {
  if (q.items.length <= 1) return { items: [], index: 0, from: '' }
  return withNext({ ...q, items: [q.items[q.index]], index: 0 }, 0)
}

// The notice for Play next and Add to queue: one song by its title, more by count.
export function queueNotice(what: 'next' | 'add', ids: string[], title: string): string {
  const one = ids.length === 1
  if (what === 'next') return `Playing next: ${one ? `"${title}"` : `${ids.length} songs`}`
  return one ? `Added to the queue: "${title}"` : `Added ${ids.length} songs to the queue`
}

// A song taken out of the queue or a playlist ("the queue", or its name).
// The title goes last, so a long one is what gets cut off.
export function removedNotice(title: string, from = 'the queue'): string {
  return title ? `Removed from ${from}: "${title}"` : `Removed a song from ${from}`
}

// A song that won't play is skipped, but after `max` failures in a row, or a
// whole queue's worth, playback stops instead of trying every song there is.
export function afterFailure(failsInARow: number, queueLength: number, max = 20): 'skip' | 'stop' {
  return failsInARow >= Math.min(max, queueLength + 1) ? 'stop' : 'skip'
}

// The notice for a song that won't play. The title goes last, so a long one
// is what gets cut off, not the reason.
export function failNotice(
  title: string,
  gone: boolean,
  outcome: 'paused' | 'skipped' | 'end'
): string {
  const why = gone ? "File is gone or can't be read" : "Format can't be played"
  const then =
    outcome === 'skipped'
      ? ', skipped'
      : outcome === 'end'
        ? ', stopped at the end of the list'
        : ''
  return `${why}${then}: "${title}"`
}

// Previous restarts the song after 3s, otherwise goes one back. Play next
// songs still wait, now behind the song you left.
export function back(q: QueueState, pos: number): { state: QueueState; restart: boolean } {
  if (pos > 3 || q.index === 0) return { state: q, restart: true }
  const next = q.next ? q.next + 1 : 0
  return { state: withNext({ ...q, index: q.index - 1 }, next), restart: false }
}

// Drops songs their plugin says are gone. The current song stays current; if
// it is gone, the next song still there takes its place.
export function prune(q: QueueState, has: (key: ItemKey) => boolean): QueueState {
  const items: ItemKey[] = []
  const marks: boolean[] = []
  const old = nextMarks(q)
  let index = -1
  q.items.forEach((id, i) => {
    if (!has(id)) return
    if (index < 0 && i >= q.index) index = items.length
    items.push(id)
    marks.push(old[i])
  })
  if (items.length === q.items.length) return q
  if (index < 0) index = Math.max(0, items.length - 1)
  return withNext({ ...q, items, index }, countNext(marks, index))
}

// `b` starts where `a` ends in the same file (the next track of a disc image),
// so playback can run on from one to the other without a reload.
export function follows(
  a: { part?: PlayablePart } | undefined,
  b: { part?: PlayablePart } | undefined
): boolean {
  const pa = a?.part
  const pb = b?.part
  return (
    !!pa &&
    !!pb &&
    pa.file === pb.file &&
    pa.end !== undefined &&
    Math.abs(pb.start - pa.end) < 0.001
  )
}

// A song that can't play now (its plugin is off) is passed over as a failed
// song is: `step` goes on from it (Next, or Previous) until one that can, at
// most once round the list. The same state when none can.
export function passOver(
  q: QueueState,
  blocked: (key: ItemKey) => boolean,
  step: (q: QueueState) => QueueState
): QueueState {
  let s = q
  for (let n = 0; n < q.items.length && blocked(s.items[s.index]); n++) {
    const next = step(s)
    if (next === s) break
    s = next
  }
  return s.items.length && blocked(s.items[s.index]) ? q : s
}
