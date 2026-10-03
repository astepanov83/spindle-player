// Back and Forward across the whole library (ticket 051), like a browser: one
// list of the places left, in any chip or section. No DOM, no store.

export interface History<T> {
  // the places left, the latest last
  back: T[]
  // the places Back left, the latest last, for Forward
  ahead: T[]
}

// Enough to go back through a long visit; older steps are dropped.
export const maxSteps = 100

export const emptyHistory = <T>(): History<T> => ({ back: [], ahead: [] })

// A new step away from `from`: what Back left is no longer ahead.
export function leave<T>(h: History<T>, from: T): History<T> {
  return { back: [...h.back, from].slice(-maxSteps), ahead: [] }
}

export interface Walk<T> {
  // a place a rescan or a delete changed: what is left of it
  fix: (t: T) => T
  same: (a: T, b: T) => boolean
}

// One step back from `now`. A place that is now the same as `now` (its album
// was removed, say) is dropped, so Back always shows something else. null
// when there is nothing to go back to.
export function goBack<T>(h: History<T>, now: T, w: Walk<T>): { h: History<T>; to: T } | null {
  const r = walk(h.back, now, w)
  return r && { h: { back: r.rest, ahead: [...h.ahead, now] }, to: r.to }
}

export function goForward<T>(h: History<T>, now: T, w: Walk<T>): { h: History<T>; to: T } | null {
  const r = walk(h.ahead, now, w)
  return r && { h: { back: [...h.back, now], ahead: r.rest }, to: r.to }
}

function walk<T>(list: T[], now: T, w: Walk<T>): { to: T; rest: T[] } | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const to = w.fix(list[i])
    if (!w.same(to, now)) return { to, rest: list.slice(0, i) }
  }
  return null
}

// Changes every step (a deleted playlist), then drops a step that became the
// same as the one before it.
export function mapSteps<T>(
  h: History<T>,
  fn: (t: T) => T,
  same: (a: T, b: T) => boolean
): History<T> {
  const map = (list: T[]): T[] =>
    list.map(fn).filter((t, i, all) => i === 0 || !same(t, all[i - 1]))
  return { back: map(h.back), ahead: map(h.ahead) }
}
