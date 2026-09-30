// Where each library view was scrolled when it was left (ticket 042). Going
// back up (mouse Back, a Back button, the path bar) returns there; a new page,
// Forward, or another section starts at the top.

// A view is its path from the section down: ['albums', 'album:<id>'],
// ['folders', 'folder:<key>', ...], ['artists', 'artist:<key>', 'album:<id>'].
export interface View {
  path: string[]
  query: string
}

const keyOf = (v: View): string => JSON.stringify(v.path)

const same = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i])

// `to` is above `from` on the same path
const above = (to: string[], from: string[]): boolean =>
  to.length < from.length && to.every((x, i) => x === from[i])

// A place is whatever the caller needs to scroll back (a scrollTop, a row).
export class ScrollPlaces<P> {
  // with the search text the view had when it was left
  #places = new Map<string, { place: P; query: string }>()

  // Keeps where `from` was left and says where `to` starts: a kept place,
  // 'top', or undefined when the view did not change (a search in it moves
  // nothing, as before).
  move(from: View | undefined, place: P, to: View): P | 'top' | undefined {
    if (!from) return 'top'
    if (same(from.path, to.path)) return undefined
    this.#places.set(keyOf(from), { place, query: from.query })
    if (!above(to.path, from.path)) return 'top'
    // other search text shows other rows, so the old place means nothing.
    // Clearing a search goes up from the results to the view they covered,
    // which was left with no text.
    const kept = this.#places.get(keyOf(to))
    return kept && kept.query === to.query ? kept.place : 'top'
  }
}
