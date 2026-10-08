// Which genre a group of items has (ticket 104).

// The genre most of the tracks have, spelled as the first of them spells it;
// a tie goes to the one that comes first.
export function commonGenre(entries: readonly { genre?: string }[]): string | undefined {
  const counts = new Map<string, { genre: string; n: number }>()
  for (const { genre } of entries) {
    const g = genre?.trim()
    if (!g) continue
    const key = g.toLowerCase()
    const c = counts.get(key)
    if (c) c.n++
    else counts.set(key, { genre: g, n: 1 })
  }
  let best: { genre: string; n: number } | undefined
  for (const c of counts.values()) if (!best || c.n > best.n) best = c
  return best?.genre
}
