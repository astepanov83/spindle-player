// Deletes cached covers nothing points at any more. Runs in the library
// process after a scan; the next scan waits for it, so the two never overlap.
import { readdir, rm, stat } from 'fs/promises'
import { join } from 'path'
import { hashOfName, mosaicHashes } from '../../covers/cover-names'

// A temp file younger than this may still be written by main (a large cover the
// stage asked for). Older ones were left by a crash.
export const tmpAgeMs = 60000

export interface PruneFs {
  readdir(dir: string): Promise<string[]>
  mtimeMs(path: string): Promise<number>
  rm(path: string): Promise<void>
}

const nodeFs: PruneFs = {
  readdir: (d) => readdir(d),
  mtimeMs: async (p) => (await stat(p)).mtimeMs,
  rm: (p) => rm(p, { force: true })
}

export interface PruneOptions {
  dir: string
  // the covers the index uses now; asked again after every wait
  used: () => Set<string>
  // sent to main and not written yet
  busy: (hash: string) => boolean
  // a newer scan was asked for: stop, its own prune comes after it
  stale: () => boolean
  // called before a file of this hash is deleted
  forget?: (hash: string) => void
  now?: () => number
  fs?: PruneFs
}

export async function pruneCoverFiles(o: PruneOptions): Promise<void> {
  const fs = o.fs ?? nodeFs
  const now = o.now ?? Date.now
  const keep = (h: string): boolean => o.used().has(h) || o.busy(h)
  if (o.stale()) return
  let names: string[]
  try {
    names = await fs.readdir(o.dir)
  } catch {
    return
  }
  for (const name of names) {
    const h = hashOfName(name)
    if (!h) continue
    // a mosaic goes as soon as one of its covers does
    const mosaic = mosaicHashes(name)
    const kept = (): boolean => (mosaic ? mosaic.every(keep) : keep(h))
    if (o.stale()) return
    if (kept()) continue
    const path = join(o.dir, name)
    if (name.endsWith('.tmp')) {
      try {
        if (now() - (await fs.mtimeMs(path)) < tmpAgeMs) continue
      } catch {
        continue
      }
      // things may have changed during the wait
      if (o.stale()) return
      if (kept()) continue
    }
    // a mosaic is not its first cover's own file
    if (!mosaic) o.forget?.(h)
    try {
      await fs.rm(path)
    } catch {
      // tried again after the next scan
    }
  }
}

// Temp files a crash left in the cover cache, removed when the library process
// starts. That may be a restart while main is still writing covers, so a young
// one is left alone like in the prune; the next prune takes it if it stays.
export async function removeOldTemp(
  dir: string,
  now: () => number = Date.now,
  fs: PruneFs = nodeFs
): Promise<void> {
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    // no folder yet
    return
  }
  for (const name of names) {
    if (!name.endsWith('.tmp')) continue
    const path = join(dir, name)
    try {
      if (now() - (await fs.mtimeMs(path)) >= tmpAgeMs) await fs.rm(path)
    } catch {
      // gone already
    }
  }
}
