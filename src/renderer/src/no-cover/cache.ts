// Made pictures, drawn once and kept as blob URLs (ticket 103). The virtual
// grids show thousands while scrolling, so each is drawn once per key and
// shown through an <img> as a real cover is. Over `max` pictures, the ones
// used longest ago are dropped and their URLs freed.

export interface UrlIo {
  create(blob: Blob): string
  revoke(url: string): void
}

export class PictureCache {
  // in the order they were last used, oldest first
  #urls = new Map<string, string>()
  #pending = new Map<string, Promise<string | undefined>>()

  constructor(
    readonly io: UrlIo,
    readonly max = 3000
  ) {}

  get size(): number {
    return this.#urls.size
  }

  // The URL drawn for `key`, if there is one; it counts as used now.
  get(key: string): string | undefined {
    const url = this.#urls.get(key)
    if (url === undefined) return undefined
    this.#urls.delete(key)
    this.#urls.set(key, url)
    return url
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
      const url = this.io.create(await make())
      this.#urls.set(key, url)
      this.#trim()
      return url
    } catch {
      return undefined
    } finally {
      this.#pending.delete(key)
    }
  }

  #trim(): void {
    for (const [key, url] of this.#urls) {
      if (this.#urls.size <= this.max) return
      this.#urls.delete(key)
      this.io.revoke(url)
    }
  }
}
