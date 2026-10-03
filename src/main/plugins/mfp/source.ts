// Music For Programming's data (tickets 052, 061): the episodes from
// mfp.json, the switch, and reading the site again when asked. Off, it makes
// no request and writes nothing; what it has stays.
import type { MfpStatus } from '../../../shared/mfp'
import type { MadeCover } from '../../covers/covers'
import type { MfpEpisode } from './site'
import { isStale, parseMfp, refreshEpisodes, serializeMfp, type MfpData } from './store'

export interface MfpSourceOptions {
  site: string
  // mfp.json's value; undefined when missing or broken
  read: () => unknown
  save: (data: unknown) => void
  fetchText: (url: string) => Promise<string>
  fetchBytes: (url: string) => Promise<Uint8Array>
  // the picture into the cover cache, with its colors; undefined when it failed
  addCover: (data: Uint8Array) => Promise<MadeCover | undefined>
  // whether its files are still in the cache
  hasCover: (c: MadeCover) => Promise<boolean>
  // colors picked by an older paletteVersion picked again (the same object
  // when they are current); undefined when that failed
  recolor: (c: MadeCover) => Promise<MadeCover | undefined>
  now: () => number
  // the episodes or their picture changed
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

  // on or off: off only stops the network
  get episodes(): MfpEpisode[] {
    return this.#data.episodes
  }

  // kept while off too, so the prune doesn't delete it
  get cover(): MadeCover | undefined {
    return this.#data.cover
  }

  async setOn(on: boolean): Promise<void> {
    if (on === this.#on) return
    this.#on = on
    if (!on) return this.o.status(undefined)
    this.#sendStatus()
    await this.refresh(false)
  }

  // force: a manual refresh reads the site even when the file is fresh. Only
  // pages of new episodes are fetched either way.
  refresh(force: boolean): Promise<void> {
    if (!this.#on) return Promise.resolve()
    if (this.#running) return this.#running
    this.#running = this.#run(force).finally(() => {
      this.#running = undefined
      if (!this.#busy) return
      this.#busy = false
      this.#sendStatus()
    })
    return this.#running
  }

  async #run(force: boolean): Promise<void> {
    const site = force || isStale(this.#data, this.o.now())
    const had = this.#data.cover
    const picture = !had || !(await this.o.hasCover(had))
    if (!this.#on) return
    if (!site && !picture) return this.#recolor(had!)
    this.#busy = true
    this.#sendStatus()
    let changed = false
    if (site) {
      try {
        const r = await refreshEpisodes({
          site: this.o.site,
          known: this.#data.episodes,
          fetchText: this.o.fetchText,
          log: this.o.log
        })
        // turned off meanwhile: nothing is kept or written
        if (!this.#on) return
        this.#data = { ...this.#data, fetchedAt: this.o.now(), episodes: r.episodes }
        this.#error = undefined
        changed = true
        if (r.failed) this.o.log(`Music For Programming: ${r.failed} episodes to try again later`)
      } catch (e) {
        if (!this.#on) return
        this.#error = String((e as Error)?.message ?? e)
        this.o.log(`Music For Programming: could not read the site: ${this.#error}`)
        // the picture is on the same site
        return
      }
    }
    if (picture) changed = (await this.#picture()) || changed
    else await this.#recolor(had!)
    if (changed && this.#on) this.#keep()
  }

  // Fetched once into the cover cache; all episodes share it. True when it
  // changed. A failure leaves the episodes with no picture until next time.
  async #picture(): Promise<boolean> {
    try {
      const data = await this.o.fetchBytes(`${this.o.site}/img/folder.jpg`)
      if (!this.#on) return false
      const made = await this.o.addCover(data)
      if (!made) throw new Error('the picture could not be made into a cover')
      this.#data = { ...this.#data, cover: made }
      return true
    } catch (e) {
      this.o.log(`Music For Programming: no picture this time: ${e}`)
      return false
    }
  }

  // If new colors can't be picked, the old ones stay until the next run.
  async #recolor(had: MadeCover): Promise<void> {
    const next = await this.o.recolor(had)
    if (!next || next === had || !this.#on || this.#data.cover !== had) return
    this.#data = { ...this.#data, cover: next }
    this.#keep()
  }

  #keep(): void {
    this.o.save(serializeMfp(this.#data))
    this.o.changed()
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
