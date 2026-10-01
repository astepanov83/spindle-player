// File names in the cover cache, by the sha1 of the source picture. Plain TS,
// so main's cover cache and the library process (no Electron there) share them.
//   <hash>.jpg        the small cover, made at scan time
//   <hash>-large.jpg  the stage's cover, made on first use
//   <hash>.bad        a picture that could not be decoded
//   <h1>-<h2>-<h3>-<h4>.mosaic.jpg  4 small covers in a 2x2 square, made on first use
// Main writes each through "<name>.<pid>.<n>.tmp".

export function isCoverHash(s: string): boolean {
  return /^[0-9a-f]{40}$/.test(s)
}

export const smallName = (hash: string): string => `${hash}.jpg`
export const largeName = (hash: string): string => `${hash}-large.jpg`
export const badName = (hash: string): string => `${hash}.bad`
export const mosaicName = (hashes: string[]): string => `${hashes.join('-')}.mosaic.jpg`

// The 4 covers of a mosaic file (a temp one too); undefined for any other file.
export function mosaicHashes(name: string): string[] | undefined {
  const m = /^([0-9a-f]{40})-([0-9a-f]{40})-([0-9a-f]{40})-([0-9a-f]{40})\.mosaic\.jpg/.exec(name)
  return m ? m.slice(1) : undefined
}

// The cover a file in the cache belongs to; undefined for anything else.
export function hashOfName(name: string): string | undefined {
  const h = name.slice(0, 40)
  return isCoverHash(h) ? h : undefined
}

// A small cover or a bad marker, as loaded at start.
export function markerOf(name: string): { hash: string; bad: boolean } | undefined {
  const hash = hashOfName(name)
  if (!hash) return undefined
  if (name === smallName(hash)) return { hash, bad: false }
  if (name === badName(hash)) return { hash, bad: true }
  return undefined
}
