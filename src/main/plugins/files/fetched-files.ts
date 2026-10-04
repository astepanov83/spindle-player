// The pictures the online lookup downloaded, as they came (ticket 014). The
// cache keeps only resized copies, and the large one is made on first use
// from the source picture; a fetched cover has no file in the music folders.
import { mkdir, readdir, readFile, rm, stat } from 'fs/promises'
import { join } from 'path'
import { writeFileAtomic } from '../../json-file'
import { isCoverHash } from '../../covers/cover-names'

const ext = '.img'
// a temp file younger than this may still be written
const tmpAgeMs = 60000

const sourcePath = (dir: string, h: string): string => join(dir, h + ext)

export async function saveSource(dir: string, h: string, data: Uint8Array): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFileAtomic(sourcePath(dir, h), data)
}

export async function readSource(dir: string, h: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(sourcePath(dir, h)))
}

export async function listSources(dir: string): Promise<Set<string>> {
  const out = new Set<string>()
  try {
    for (const n of await readdir(dir)) {
      const h = n.slice(0, -ext.length)
      if (n.endsWith(ext) && isCoverHash(h)) out.add(h)
    }
  } catch {
    // nothing downloaded yet
  }
  return out
}

// Deletes the pictures no result points at any more, and anything else left there.
export async function pruneSources(dir: string, keep: (hash: string) => boolean): Promise<void> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return
  }
  for (const n of names) {
    const p = join(dir, n)
    try {
      if (n.endsWith('.tmp') && Date.now() - (await stat(p)).mtimeMs < tmpAgeMs) continue
      const h = n.slice(0, -ext.length)
      if (n.endsWith(ext) && isCoverHash(h) && keep(h)) continue
      await rm(p, { force: true })
    } catch {
      // gone meanwhile
    }
  }
}
