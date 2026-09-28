// The line the library process logs when a scan ends.

// The walk, the stats and the reads overlap (ticket 022), so each is logged
// by the time it ended, counted from the start of the scan.
const phases = ['listed', 'sizes', 'tags']

// `ends` has the end of each phase that finished: a scan that failed part way
// has fewer, and one that failed while listing has none. `firstSent`: when the
// page first got songs this scan read.
export function scanLogLine(
  ms: number,
  ends: number[],
  read: number,
  tracks: number,
  albums: number,
  firstSent?: number
): string {
  const times = ends.map((t, i) => `${phases[i]} at ${t}`).join(', ')
  return (
    `Library scan: ${ms} ms${times ? ` (${times})` : ''}, ` +
    `${read} files read` +
    (firstSent === undefined ? '' : ` (first sent at ${firstSent})`) +
    `, ${tracks} songs in ${albums} albums`
  )
}
