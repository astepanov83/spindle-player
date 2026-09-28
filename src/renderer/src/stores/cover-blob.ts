// The cover for the system's media controls. Chromium can't hand MPRIS a
// spindle:// picture (it gives no mpris:artUrl), but from a blob: URL it
// writes a temp file and gives MPRIS that (checked under Xvfb with gdbus). So
// the cover is fetched here and handed over as a blob, with the type main
// gave it. Only one blob is kept; the one before is freed.

export interface Artwork {
  src: string
  type?: string
}

export interface BlobIo {
  fetch(url: string): Promise<{ ok: boolean; blob(): Promise<Blob> }>
  create(blob: Blob): string
  revoke(url: string): void
}

export class CoverBlob {
  // the cover asked for last, and what it gave
  #src = ''
  #result: Promise<Artwork | undefined> = Promise.resolve(undefined)
  #art: Artwork | undefined

  constructor(readonly io: BlobIo) {}

  // The artwork for a cover URL, or undefined if it can't be had or a newer
  // cover was asked for in the meantime. The same cover again costs nothing.
  load(src: string): Promise<Artwork | undefined> {
    if (src !== this.#src) {
      this.#src = src
      this.#result = this.#fetch(src)
    }
    return this.#result
  }

  async #fetch(src: string): Promise<Artwork | undefined> {
    let blob: Blob | undefined
    try {
      const res = await this.io.fetch(src)
      if (res.ok) blob = await res.blob()
    } catch {
      // no cover in the media controls this time
    }
    if (src !== this.#src) return undefined
    if (!blob) {
      // try again next time it is asked for
      this.#src = ''
      return undefined
    }
    if (this.#art) this.io.revoke(this.#art.src)
    this.#art = { src: this.io.create(blob), ...(blob.type ? { type: blob.type } : {}) }
    return this.#art
  }
}
