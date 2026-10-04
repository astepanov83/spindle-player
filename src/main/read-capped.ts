// Reading an answer's body with a size cap, for every request to a server the
// app doesn't control: cover services, station sites, logos.

// pictures bigger than this are not taken
export const maxImage = 10 * 1024 * 1024

// The body, or undefined past `max` bytes. The header's length is not trusted.
export async function readCapped(res: Response, max: number): Promise<Uint8Array | undefined> {
  if (!res.body) return new Uint8Array()
  const parts: Uint8Array[] = []
  let size = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) {
      await reader.cancel()
      return undefined
    }
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
