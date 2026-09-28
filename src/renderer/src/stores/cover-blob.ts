// The picture for the system's media controls. Chromium can't hand MPRIS a
// spindle:// picture (it gives no mpris:artUrl), but from a blob: URL it
// writes a temp file and gives MPRIS that (checked under Xvfb with gdbus). So
// the cover is fetched here and handed over as a blob, with the type main
// gave it. A song with no cover gets a made-up tile instead, since Chromium
// would keep showing the last picture. Only one blob is kept; the one before
// is freed.

export interface Artwork {
  src: string
  type?: string
}

export interface BlobIo {
  create(blob: Blob): string
  revoke(url: string): void
}

export class CoverBlob {
  // the picture asked for last, and what it gave
  #key = ''
  #result: Promise<Artwork | undefined> = Promise.resolve(undefined)
  #art: Artwork | undefined

  constructor(readonly io: BlobIo) {}

  // The artwork for a picture, made by `make` (a fetch, a drawing) and named
  // by `key`, or undefined if it can't be had or a newer one was asked for in
  // the meantime. The same key again costs nothing.
  load(key: string, make: () => Promise<Blob | undefined>): Promise<Artwork | undefined> {
    if (key !== this.#key) {
      this.#key = key
      this.#result = this.#make(key, make)
    }
    return this.#result
  }

  async #make(key: string, make: () => Promise<Blob | undefined>): Promise<Artwork | undefined> {
    let blob: Blob | undefined
    try {
      blob = await make()
    } catch {
      // no picture in the media controls this time
    }
    if (key !== this.#key) return undefined
    if (!blob) {
      // try again next time it is asked for
      this.#key = ''
      return undefined
    }
    if (this.#art) this.io.revoke(this.#art.src)
    this.#art = { src: this.io.create(blob), ...(blob.type ? { type: blob.type } : {}) }
    return this.#art
  }
}

// A cover from main, or undefined when main has none.
export async function fetchBlob(url: string): Promise<Blob | undefined> {
  const res = await fetch(url)
  return res.ok ? res.blob() : undefined
}
