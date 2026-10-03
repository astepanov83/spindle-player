// Track and album ids.
import { hash } from 'crypto'

// Short and stable: the same path gives the same id on every start.
export function shortHash(s: string): string {
  // the one-shot hash() is about twice as fast as createHash for 50k paths
  return hash('sha1', s).slice(0, 16)
}

// A track of a disc image split by a cue sheet (not a whole file).
export function cueTrackId(imagePath: string, no: number): string {
  return shortHash(`${imagePath}#${no}`)
}
