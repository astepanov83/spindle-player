// Track and album ids.
import { hash } from 'crypto'

// Short and stable: the same path gives the same id on every start.
export function shortHash(s: string): string {
  // the one-shot hash() is about twice as fast as createHash for 50k paths
  return hash('sha1', s).slice(0, 16)
}
