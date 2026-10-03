// Music For Programming in the library process (ticket 052): the episodes
// from mfp.json, the setting, and reading the site again when asked.
import type { MfpStatus } from '../../shared/library'
import type { MfpEpisode } from './mfp'
import { isStale, parseMfp, refreshEpisodes, serializeMfp, type MfpData } from './mfp-store'

export interface MfpSourceOptions {
  site: string
  // mfp.json's value; undefined when missing or broken
  read: () => unknown
  save: (data: unknown) => void
  fetchText: (url: string) => Promise<string>
  fetchBytes: (url: string) => Promise<Uint8Array>
  // puts a picture in the cover cache, like a cover found online
  addCover: (data: Uint8Array) => Promise<{ hash: string; ok: boolean }>
  hasCover: (hash: string) => boolean
  now: () => number
  // the episodes or their picture changed: build the library again
  changed: () => void
  status: (s: MfpStatus | undefined) => void
  log: (text: string) => void
}

export class MfpSource {
  #data: MfpData = { fetchedAt: 0, episodes: [] }
  #on = false
  #running: Promise<void> | undefined
  // set before the first request goes out, for the status
  #busy = false
  #error: string | undefined

  constructor(readonly o: MfpSourceOptions) {}

  load(): void {
    this.#data = parseMfp(this.o.read())
  }

  // none while the setting is off
  get episodes(): MfpEpisode[] {
    return this.#on ? this.#data.episodes : []
  }

  // kept while off too, so the prune doesn't delete it
  get cover(): string | undefined {
    return this.#data.cover
  }

  async setOn(on: boolean): Promise<void> {
    if (on === this.#on) return
    this.#on = on
    this.o.changed()
    if (!on) return this.o.status(undefined)
    this.#sendStatus()
    await this.refresh(false)
  }

  // force: a manual Rescan reads the site even when the file is fresh. Only
  // pages of new episodes are fetched either way.
  refresh(force: boolean): Promise<void> {
    if (!this.#on) return Promise.resolve()
    if (this.#running) return this.#running
    const site = force || isStale(this.#data, this.o.now())
    const cover = this.#data.cover
    const picture = !cover || !this.o.hasCover(cover)
    if (!site && !picture) return Promise.resolve()
    this.#busy = true
    this.#sendStatus()
    this.#running = this.#run(site).finally(() => {
      this.#running = undefined
      this.#busy = false
      this.#sendStatus()
    })
    return this.#running
  }

  async #run(site: boolean): Promise<void> {
    let changed = false
    if (site) {
      try {
        const r = await refreshEpisodes({
          site: this.o.site,
          known: this.#data.episodes,
          fetchText: this.o.fetchText,
          log: this.o.log
        })
        this.#data = { ...this.#data, fetchedAt: this.o.now(), episodes: r.episodes }
        this.#error = undefined
        changed = true
        if (r.failed) this.o.log(`Music For Programming: ${r.failed} episodes to try again later`)
      } catch (e) {
        this.#error = String((e as Error)?.message ?? e)
        this.o.log(`Music For Programming: could not read the site: ${this.#error}`)
        // the picture is on the same site
        return
      }
    }
    const cover = this.#data.cover
    if (!cover || !this.o.hasCover(cover)) {
      try {
        const r = await this.o.addCover(await this.o.fetchBytes(`${this.o.site}/img/folder.jpg`))
        if (r.ok && r.hash !== cover) {
          this.#data = { ...this.#data, cover: r.hash }
          changed = true
        }
      } catch (e) {
        // the albums show no picture until the next refresh gets it
        this.o.log(`Music For Programming: no picture this time: ${e}`)
      }
    }
    if (!changed) return
    this.o.save(serializeMfp(this.#data))
    if (this.#on) this.o.changed()
  }

  #sendStatus(): void {
    if (!this.#on) return
    const s: MfpStatus = {
      episodes: this.#data.episodes.length,
      fetchedAt: this.#data.fetchedAt,
      running: this.#busy
    }
    if (this.#error) s.error = this.#error
    this.o.status(s)
  }
}
