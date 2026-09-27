// Resized covers on disk, named by the hash of the source picture.
// "<hash>.jpg" is the small one made at scan time, "<hash>-large.jpg" is made
// the first time the stage asks for it, and "<hash>.bad" marks a picture that
// could not be decoded, so it is not tried again on every scan.
//
// Resizing uses Electron's nativeImage, which only works in main. sharp was
// tried in the scan worker, but on Linux it clashes with the glib Electron loads.
import { mkdirSync, readdirSync } from 'fs'
import { rename, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { nativeImage } from 'electron'

export const smallSide = 320
export const largeSide = 1000
const quality = 85

export function isCoverHash(s: string): boolean {
  return /^[0-9a-f]{40}$/.test(s)
}

// Scales so the shorter side is `side`, never up.
function resized(data: Uint8Array, side: number): Buffer | undefined {
  const img = nativeImage.createFromBuffer(Buffer.from(data.buffer, data.byteOffset, data.length))
  if (img.isEmpty()) return undefined
  const { width, height } = img.getSize()
  const scale = Math.min(1, side / Math.min(width, height))
  const out =
    scale < 1
      ? img.resize({
          width: Math.round(width * scale),
          height: Math.round(height * scale),
          quality: 'good'
        })
      : img
  return out.toJPEG(quality)
}

async function writeAtomic(path: string, data: Buffer | string): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
}

// Lets IPC and other work run between two pictures.
const nextTurn = (): Promise<void> => new Promise((r) => setImmediate(r))

export class CoverCache {
  #small = new Set<string>()
  #bad = new Set<string>()
  #large = new Map<string, Promise<string | undefined>>()
  // one picture at a time
  #chain: Promise<void> = Promise.resolve()

  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true })
    for (const name of readdirSync(dir)) {
      const m = /^([0-9a-f]{40})\.(jpg|bad)$/.exec(name)
      if (m) (m[2] === 'jpg' ? this.#small : this.#bad).add(m[1])
    }
  }

  has(hash: string): boolean {
    return this.#small.has(hash)
  }

  smallPath(hash: string): string {
    return join(this.dir, `${hash}.jpg`)
  }

  // Makes the small cover. Resolves once it is on disk (or marked bad).
  add(hash: string, data: Uint8Array): Promise<void> {
    const job = this.#chain.then(async () => {
      if (this.#small.has(hash) || this.#bad.has(hash)) return
      await nextTurn()
      const jpg = resized(data, smallSide)
      if (jpg) {
        await writeAtomic(this.smallPath(hash), jpg)
        this.#small.add(hash)
      } else {
        await writeAtomic(join(this.dir, `${hash}.bad`), '')
        this.#bad.add(hash)
      }
    })
    this.#chain = job.catch((e) => console.error('Could not save a cover', e))
    return this.#chain
  }

  // The big cover's path, made from `source` the first time.
  large(hash: string, source: () => Promise<Uint8Array | undefined>): Promise<string | undefined> {
    let p = this.#large.get(hash)
    if (!p) {
      p = this.#makeLarge(hash, source)
      this.#large.set(hash, p)
      // a failure may be a file that is back later
      p.then((r) => r ?? this.#large.delete(hash))
    }
    return p
  }

  async #makeLarge(
    hash: string,
    source: () => Promise<Uint8Array | undefined>
  ): Promise<string | undefined> {
    const path = join(this.dir, `${hash}-large.jpg`)
    try {
      await stat(path)
      return path
    } catch {
      // not made yet
    }
    try {
      const data = await source()
      const jpg = data && resized(data, largeSide)
      if (!jpg) return undefined
      await writeAtomic(path, jpg)
      return path
    } catch (e) {
      console.error('Could not make a large cover', e)
      return undefined
    }
  }

  // Deletes covers no album or file points at any more.
  async prune(used: Set<string>): Promise<void> {
    const names = readdirSync(this.dir)
    for (const name of names) {
      const hash = name.slice(0, 40)
      if (!isCoverHash(hash) || used.has(hash)) continue
      this.#small.delete(hash)
      this.#bad.delete(hash)
      this.#large.delete(hash)
      await rm(join(this.dir, name), { force: true })
    }
  }
}
