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
  // The shuffle walk, while shuffle is on and has picked a song. Not saved.
  shuffle?: Walk
}

// Rows in the order shuffle plays them (ticket 076). Up to `at` they have
// played, `order[at]` being the current song; after it they wait. A round
// begins at `start` and plays each row once. Rows with no place in the round
// (added since, or all of them when shuffle just went on) get random places
// among the waiting ones at the next step. When none wait, a new round starts.
export interface Walk {
  order: number[]
  at: number
  start: number
}

// The state with this walk, the field left out for none.
function withWalk(q: QueueState, walk: Walk | undefined): QueueState {
  const s = { ...q }
  if (walk) s.shuffle = walk
  else delete s.shuffle
  return s
}

// The walk with `index` as the current song. A row that waited is taken out
// of the waiting ones, so it does not play twice in a round.
function walkTo(w: Walk, index: number): Walk {
  if (w.order[w.at] === index) return w
  const waiting = w.order.slice(w.at + 1).filter((r) => r !== index)
  const order = [...w.order.slice(0, w.at + 1), index, ...waiting]
  return { order, at: w.at + 1, start: Math.min(w.start, w.at + 1) }
}

// The walk after an edit: `to` gives each old row's new place, -1 when it
// went. The current song is `index` afterwards.
function remapWalk(
  w: Walk | undefined,
  to: (row: number) => number,
  index: number
): Walk | undefined {
  if (!w) return undefined
  const order: number[] = []
  let at = -1
  let start = 0
  w.order.forEach((r, k) => {
    if (k === w.start) start = order.length
    const n = to(r)
    if (n >= 0) order.push(n)
    if (k === w.at) at = order.length - 1
  })
  return walkTo({ order, at, start: Math.max(0, Math.min(start, at)) }, index)
}

// Gives rows with no place in this round random places among the waiting
// ones. The waiting ones keep their order, so Next after Previous goes the
// same way again.
function placeNew(w: Walk, n: number, random: () => number): Walk {
  const seen = new Set(w.order.slice(w.start))
  const fresh: number[] = []
  for (let r = 0; r < n; r++) if (!seen.has(r)) fresh.push(r)
  if (!fresh.length) return w
  shuffleInPlace(fresh, random)
  const waiting = w.order.slice(w.at + 1)
  // which places in the new waiting list the new rows take
  const slots = waiting.map(() => false).concat(fresh.map(() => true))
  shuffleInPlace(slots, random)
  let a = 0
  let b = 0
  const merged = slots.map((isNew) => (isNew ? fresh[b++] : waiting[a++]))
  return { ...w, order: [...w.order.slice(0, w.at + 1), ...merged] }
}

function shuffleInPlace<T>(a: T[], random: () => number): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
}

// The next song under shuffle: the next waiting row, or the first of a new
// round when every row has played once. A new round has every row, but not
// the song that just played first. It keeps the round before it, so Previous
// can go back through it.
function shuffleStep(q: QueueState, random: () => number): QueueState {
  const n = q.items.length
  let w = placeNew(q.shuffle ? walkTo(q.shuffle, q.index) : fresh(q.index), n, random)
  if (w.at + 1 >= w.order.length) {
    const at = w.at - w.start
    w = placeNew({ order: w.order.slice(w.start), at, start: at + 1 }, n, random)
    const order = w.order
    if (order[at + 1] === q.index) {
      const k = at + 2 + Math.floor(random() * (n - 1))
      ;[order[at + 1], order[k]] = [order[k], order[at + 1]]
    }
  }
  const index = w.order[w.at + 1]
  return withWalk({ ...q, index }, { ...w, at: w.at + 1 })
}

const fresh = (index: number): Walk => ({ order: [index], at: 0, start: 0 })

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
  const next = q.next ?? 0
  // Play next songs come first, with shuffle too
  if (next > 0) {
    const index = q.index + 1
    const walk = o.shuffle ? walkTo(q.shuffle ?? fresh(q.index), index) : undefined
    return withWalk(withNext({ ...q, index }, next - 1), walk)
  }
  if (o.shuffle && q.items.length > 1) return shuffleStep(q, o.random ?? Math.random)
  if (q.index + 1 >= q.items.length) return q
  return withWalk({ ...q, index: q.index + 1 }, undefined)
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
  const walk = q.shuffle && walkTo(q.shuffle, index)
  return withWalk(withNext({ ...q, index }, countNext(nextMarks(q), index)), walk)
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
  const walk = remapWalk(q.shuffle, (r) => (r > q.index ? r + keys.length : r), q.index)
  return withWalk(withNext({ ...q, items }, (q.next ?? 0) + keys.length), walk)
}

// "Add to queue": the songs go at the end.
export function append(q: QueueState, keys: ItemKey[], from = '', link?: QueueLink): QueueState {
  if (!keys.length) return q
  if (!q.items.length) return filled(keys, from, link)
  return { ...q, items: [...q.items, ...keys] }
}

// Songs dropped on the queue (ticket 089): they go in at the gap before row
// `slot`, never before the current song or among the played ones. Dropped
// right after the current song or among the Play next songs, they join them,
// as rows moved there do. An empty queue takes them, the first one current.
export function insertAt(
  q: QueueState,
  keys: ItemKey[],
  slot: number,
  from = '',
  link?: QueueLink
): QueueState {
  if (!keys.length) return q
  if (!q.items.length) return filled(keys, from, link)
  const at = Math.max(q.index + 1, Math.min(slot, q.items.length))
  const items = [...q.items.slice(0, at), ...keys, ...q.items.slice(at)]
  const old = nextMarks(q)
  const joins = at === q.index + 1 || (old[at - 1] && old[at])
  const marks = [...old.slice(0, at), ...keys.map(() => joins), ...old.slice(at)]
  const walk = remapWalk(q.shuffle, (r) => (r >= at ? r + keys.length : r), q.index)
  return withWalk(withNext({ ...q, items }, countNext(marks, q.index)), walk)
}

// Takes a row out. When it was the current song, the one after it takes its
// place, or the one before when it was the last. Under shuffle that is the
// one shuffle would play next, unless Play next songs wait.
export function removeRow(q: QueueState, i: number): QueueState {
  if (i < 0 || i >= q.items.length) return q
  if (q.items.length === 1) return { items: [], index: 0, from: '' }
  const items = q.items.filter((_, k) => k !== i)
  const marks = nextMarks(q).filter((_, k) => k !== i)
  const to = (r: number): number => (r === i ? -1 : r > i ? r - 1 : r)
  let index = i < q.index ? q.index - 1 : q.index
  if (index >= items.length) index = items.length - 1
  const w = q.shuffle
  const waits = w && w.order[w.at] === i ? w.order.slice(w.at + 1).find((r) => r !== i) : undefined
  if (i === q.index && !q.next && waits !== undefined) index = to(waits)
  const walk = remapWalk(w, to, index)
  return withWalk(withNext({ ...q, items, index }, countNext(marks, index)), walk)
}

// Takes several rows out (ticket 086), the last first, so a current song
// that goes hands over to the next row that stays.
export function removeRows(q: QueueState, rows: readonly number[]): QueueState {
  return [...new Set(rows)].sort((a, b) => b - a).reduce(removeRow, q)
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
  return undoRemoveRows(now, before, after, [at])
}

// Undo of removeRows: each row back at its place, the first first.
export function undoRemoveRows(
  now: QueueState,
  before: QueueState,
  after: QueueState,
  rows: readonly number[]
): { state: QueueState; restart: boolean } {
  const sorted = [...new Set(rows)].sort((a, b) => a - b)
  if (sorted.includes(before.index) && now.index === after.index) {
    return { state: before, restart: true }
  }
  return { state: sorted.reduce((s, at) => putBack(s, before, at), now), restart: false }
}

// Row `at` of `before` back at its place in `now`.
function putBack(now: QueueState, before: QueueState, at: number): QueueState {
  const wasCurrent = at === before.index
  const pos = Math.min(at, now.items.length)
  const items = [...now.items.slice(0, pos), before.items[at], ...now.items.slice(pos)]
  const marks = nextMarks(now)
  marks.splice(pos, 0, !wasCurrent && nextMarks(before)[at])
  const index = pos <= now.index ? now.index + 1 : now.index
  let walk = remapWalk(now.shuffle, (r) => (r >= pos ? r + 1 : r), index)
  if (walk && playedInRound(before.shuffle, at)) {
    // it played this round already: it goes back among the played ones
    const order = [...walk.order]
    order.splice(walk.start, 0, pos)
    walk = { ...walk, order, at: walk.at + 1 }
  }
  return withWalk(withNext({ ...now, items, index }, countNext(marks, index)), walk)
}

function playedInRound(w: Walk | undefined, row: number): boolean {
  return !!w && w.order.slice(w.start, w.at + 1).includes(row)
}

// Moves the row at `from` so it ends up at `to`. The current song stays
// current. A row that lands right after it, or among the Play next songs,
// becomes one of them.
export function moveRow(q: QueueState, from: number, to: number): QueueState {
  const n = q.items.length
  if (from === to || from < 0 || from >= n || to < 0 || to >= n) return q
  return reorder(q, moveOrder(n, [from], to > from ? to + 1 : to), [from])
}

// The rows in a new order: `order[j]` is the old row that goes to place j.
// The current song stays current. A run of `moved` rows that lands right
// after it, or among the Play next songs, becomes Play next songs.
export function reorder(q: QueueState, order: number[], moved: readonly number[]): QueueState {
  const old = nextMarks(q)
  const marks = order.map((k) => old[k])
  const index = order.indexOf(q.index)
  const going = new Set(moved)
  going.delete(q.index)
  for (let j = 0; j < order.length; j++) {
    if (!going.has(order[j])) continue
    let e = j
    while (e + 1 < order.length && going.has(order[e + 1])) e++
    if (j === index + 1 || (marks[j - 1] && marks[e + 1])) marks.fill(true, j, e + 1)
    j = e
  }
  const next = countNext(marks, index)
  // nothing moved: the same list, so nothing is saved again
  if (order.every((k, j) => k === j)) return next === (q.next ?? 0) ? q : withNext(q, next)
  const items = order.map((k) => q.items[k])
  const place: number[] = []
  order.forEach((k, j) => (place[k] = j))
  const walk = remapWalk(q.shuffle, (r) => place[r], index)
  return withWalk(withNext({ ...q, items, index }, next), walk)
}

// The order with rows `rows` taken out and put back together, in their
// order, at the gap before row `slot` (`n` for the end).
export function moveOrder(n: number, rows: readonly number[], slot: number): number[] {
  const going = new Set(rows)
  const order: number[] = []
  for (let r = 0; r < Math.min(slot, n); r++) if (!going.has(r)) order.push(r)
  order.push(...[...going].sort((a, b) => a - b))
  for (let r = Math.max(0, slot); r < n; r++) if (!going.has(r)) order.push(r)
  return order
}

// Alt+Up / Alt+Down with several rows: each run of rows next to each other
// moves one place past the row above or below it. A run at the top (or the
// bottom) stays.
export function shiftOrder(n: number, rows: readonly number[], dir: -1 | 1): number[] {
  const going = new Set(rows)
  const order = Array.from({ length: n }, (_, k) => k)
  const runs: [number, number][] = []
  for (let r = 0; r < n; r++) {
    if (!going.has(r)) continue
    const a = r
    while (r + 1 < n && going.has(r + 1)) r++
    runs.push([a, r])
  }
  for (const [a, b] of runs) {
    if (dir < 0 && a > 0) order.splice(b, 0, order.splice(a - 1, 1)[0])
    if (dir > 0 && b < n - 1) order.splice(a, 0, order.splice(b + 1, 1)[0])
  }
  return order
}

// The Clear button: only the current song is left, so what plays goes on.
// A second Clear takes that one out too.
export function clearQueue(q: QueueState): QueueState {
  if (q.items.length <= 1) return { items: [], index: 0, from: '' }
  const walk = remapWalk(q.shuffle, (r) => (r === q.index ? 0 : -1), 0)
  return withWalk(withNext({ ...q, items: [q.items[q.index]], index: 0 }, 0), walk)
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

// Previous restarts the song after 3s, otherwise goes one back: under
// shuffle, one back along the walk. Play next songs still wait, now behind
// the song you left.
export function back(
  q: QueueState,
  pos: number,
  shuffle = false
): { state: QueueState; restart: boolean } {
  if (shuffle) return backShuffled(q, pos)
  if (pos > 3 || q.index === 0) return { state: q, restart: true }
  const next = q.next ? q.next + 1 : 0
  return { state: withNext({ ...q, index: q.index - 1 }, next), restart: false }
}

// The walk keeps the Play next songs right after the song you left. They
// are no longer right after the current song, so they no longer count as
// Play next songs: the walk plays them.
function backShuffled(q: QueueState, pos: number): { state: QueueState; restart: boolean } {
  const w = q.shuffle
  if (pos > 3 || !w || w.order[w.at] !== q.index || w.at === 0) return { state: q, restart: true }
  const n = q.next ?? 0
  const waiting = Array.from({ length: n }, (_, k) => q.index + 1 + k)
  const rest = w.order.slice(w.at + 1).filter((r) => !waiting.includes(r))
  const order = [...w.order.slice(0, w.at + 1), ...waiting, ...rest]
  const at = w.at - 1
  const walk = { order, at, start: Math.min(w.start, at) }
  return { state: withWalk(withNext({ ...q, index: order[at] }, 0), walk), restart: false }
}

// Drops songs their plugin says are gone. The current song stays current; if
// it is gone, the next song still there takes its place.
export function prune(q: QueueState, has: (key: ItemKey) => boolean): QueueState {
  const items: ItemKey[] = []
  const marks: boolean[] = []
  const place: number[] = []
  const old = nextMarks(q)
  let index = -1
  q.items.forEach((id, i) => {
    place.push(-1)
    if (!has(id)) return
    if (index < 0 && i >= q.index) index = items.length
    place[i] = items.length
    items.push(id)
    marks.push(old[i])
  })
  if (items.length === q.items.length) return q
  if (index < 0) index = Math.max(0, items.length - 1)
  const walk = items.length ? remapWalk(q.shuffle, (r) => place[r], index) : undefined
  return withWalk(withNext({ ...q, items, index }, countNext(marks, index)), walk)
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
