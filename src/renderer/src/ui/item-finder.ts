// Where an item's row is in a list that draws only the rows on screen, so a
// new look can start at the item the old one showed (ticket 095). Each such
// list says where its items are while it is drawn.

// The top of the item's row in the scroll box's content, in px; none when
// the list doesn't have it.
export type Finder = (key: string) => number | undefined

const finders = new Set<Finder>()

// Returns the function that takes it away.
export function addFinder(f: Finder): () => void {
  finders.add(f)
  return () => finders.delete(f)
}

export function findItem(key: string): number | undefined {
  for (const f of finders) {
    const at = f(key)
    if (at !== undefined) return at
  }
  return undefined
}
