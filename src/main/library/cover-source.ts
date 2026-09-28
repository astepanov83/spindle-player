// Finds the picture a cover hash was made from, to make the large cover.
import { hash } from 'crypto'

// A file may have changed since the scan. Its new picture would be made into
// the large cover under the old hash, and kept for good, so only a picture
// that still has this hash counts. The next candidate is tried otherwise.
export async function pictureWithHash(
  h: string,
  candidates: Iterable<() => Promise<Uint8Array | undefined>>
): Promise<Uint8Array | undefined> {
  for (const read of candidates) {
    let data
    try {
      data = await read()
    } catch {
      // gone or unreadable; try the next one
      continue
    }
    if (data && hash('sha1', data) === h) return data
  }
  return undefined
}
