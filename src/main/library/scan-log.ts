// The line the library process logs when a scan ends.

const phases = ['listing', 'sizes and images', 'tags']

// `took` has the ms of each phase that finished: a scan that failed part way
// has fewer, and one that failed while listing has none.
export function scanLogLine(
  ms: number,
  took: number[],
  read: number,
  tracks: number,
  albums: number
): string {
  const times = took.map((t, i) => `${phases[i]} ${t}`).join(', ')
  return (
    `Library scan: ${ms} ms${times ? ` (${times})` : ''}, ` +
    `${read} files read, ${tracks} songs in ${albums} albums`
  )
}
