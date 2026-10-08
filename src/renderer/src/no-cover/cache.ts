// Made pictures, drawn once and kept as blob URLs (ticket 103). The virtual
// grids show thousands while scrolling, so each is drawn once per key and
// shown through an <img> as a real cover is. Over `max` pictures or `maxBytes`
// of PNGs, the ones used longest ago are dropped and their URLs freed, except
// ones a tile on screen holds.

export interface UrlIo {
  create(blob: Blob): string
  revoke(url: string): void
}

export class PictureCache {
  // in the order they were last used, oldest first
  #urls = new Map<string, { url: string; bytes: number }>()
  #bytes = 0
  #pending = new Map<string, Promise<string | undefined>>()
  // how many tiles show or wait for each key
  #holds = new Map<string, number>()

  constructor(
    readonly io: UrlIo,
    readonly max = 3000,
    readonly maxBytes = Infinity
  ) {}

  get size(): number {
    return this.#urls.size
  }

  get bytes(): number {
    return this.#bytes
  }

  // A tile shows or waits for `key` until the returned function is called.
  hold(key: string): () => void {
    this.#holds.set(key, (this.#holds.get(key) ?? 0) + 1)
    let held = true
    return () => {
      if (!held) return
      held = false
      const n = this.#holds.get(key)! - 1
      if (n) this.#holds.set(key, n)
      else this.#holds.delete(key)
    }
  }

  held(key: string): boolean {
    return this.#holds.has(key)
  }

  // The URL drawn for `key`, if there is one; it counts as used now.
  get(key: string): string | undefined {
    const e = this.#urls.get(key)
    if (e === undefined) return undefined
    this.#urls.delete(key)
    this.#urls.set(key, e)
    return e.url
  }

  // The URL for `key`, drawn by `make` the first time. Asks while it is drawn
  // wait for the same drawing. A drawing that fails is tried again next time.
  load(key: string, make: () => Promise<Blob>): Promise<string | undefined> {
    const url = this.get(key)
    if (url !== undefined) return Promise.resolve(url)
    let p = this.#pending.get(key)
    if (!p) {
      p = this.#make(key, make)
      this.#pending.set(key, p)
    }
    return p
  }

  async #make(key: string, make: () => Promise<Blob>): Promise<string | undefined> {
    try {
      const blob = await make()
      const url = this.io.create(blob)
      this.#urls.set(key, { url, bytes: blob.size })
      this.#bytes += blob.size
      this.#trim()
      return url
    } catch {
      return undefined
    } finally {
      this.#pending.delete(key)
    }
  }

  #trim(): void {
    for (const [key, e] of this.#urls) {
      if (this.#urls.size <= this.max && this.#bytes <= this.maxBytes) return
      if (this.#holds.has(key)) continue
      this.#urls.delete(key)
      this.#bytes -= e.bytes
      this.io.revoke(e.url)
    }
  }
}
