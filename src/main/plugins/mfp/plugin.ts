// Music For Programming (tickets 052, 061): mfp.json, reading the site, the
// site's picture in the cover cache, the episodes for the page, and
// spindle://mfp/<episode id> for the audio. Off means no network and no
// change to mfp.json; what it has stays, and the handlers answer from it.
import { join } from 'path'
import { MfpChannel } from '../../../shared/ipc'
import type { Episode, MfpEpisodes, MfpStatus } from '../../../shared/plugins/mfp/mfp'
import type { PluginId } from '../../../shared/plugins'
import { JsonFileWriter, readJsonFile, removeStrayTmp } from '../../json-file'
import { makeCover, withNewColors } from '../../covers/covers'
import type { CoverService, MainPlugin, PluginContext } from '../types'
import { pageEpisode } from './episodes'
import { notFound, onlineMedia } from './media'
import { MfpSource } from './source'

export const mfpSite = 'https://musicforprogramming.net'
// the site's picture is about 200 KB
const maxPictureBytes = 5 * 1024 * 1024

export class MfpPlugin implements MainPlugin {
  readonly id: PluginId = 'mfp'
  readonly #source: MfpSource
  // none when the file could not be read; it is only a copy of the site, so
  // a broken one is simply written again
  readonly #writer: JsonFileWriter<unknown> | undefined
  #ctx: PluginContext | undefined
  #on = false
  // as the page gets them, and each episode's mp3 by its id
  #episodes: Episode[] = []
  #urls = new Map<string, string>()
  // covers made this run, kept before their files are written
  #made = new Set<string>()
  // as last sent; none while off
  #status: MfpStatus | undefined

  constructor(
    userData: string,
    private readonly o: { log(text: string): void; now?: () => number }
  ) {
    // opened here, not in start: the library's first prune asks for its cover
    const path = join(userData, 'mfp.json')
    // a write cut off by a quit or crash: the app's own leftovers, on or off
    removeStrayTmp(path)
    const r = readJsonFile(path)
    if (r.kind === 'broken' || r.kind === 'unreadable')
      o.log(`Music For Programming file is ${r.kind}: ${path}`)
    if (r.kind !== 'unreadable')
      this.#writer = new JsonFileWriter<unknown>(
        path,
        1000,
        (e) => o.log(`Could not save ${path}: ${e}`),
        0
      )
    this.#source = new MfpSource({
      site: mfpSite,
      read: () => (r.kind === 'ok' ? r.value : undefined),
      save: (d) => this.#writer?.schedule(d),
      fetchText: async (url) => (await this.#fetch(url)).text(),
      fetchBytes: async (url) => {
        const data = new Uint8Array(await (await this.#fetch(url)).arrayBuffer())
        if (data.length > maxPictureBytes) throw new Error(`${url} is too big for a picture`)
        return data
      },
      addCover: (data) =>
        makeCover(this.#cache(), data, (h) => {
          this.#made.add(h)
          this.#ctx?.covers.kept()
        }),
      hasCover: (c) => this.#cache().hasLogo(c.hash, !c.small),
      recolor: (c) => withNewColors(this.#cache(), c),
      now: o.now ?? Date.now,
      changed: () => {
        this.#build()
        this.#ctx?.toPage(MfpChannel.episodes, this.#data())
        this.#ctx?.covers.kept()
      },
      status: (s) => {
        this.#status = s
        this.#ctx?.toPage(MfpChannel.status, s)
      },
      log: o.log
    })
    this.#source.load()
    this.#build()
  }

  #cache(): CoverService['cache'] {
    if (!this.#ctx) throw new Error('The MFP plugin has not started')
    return this.#ctx.covers.get().cache
  }

  // Only while on: a page still being read when MFP goes off stops there.
  async #fetch(url: string): Promise<Response> {
    const ctx = this.#ctx
    if (!ctx || !this.#on) throw new Error('Music For Programming is off')
    const res = await ctx.fetch(url, {
      headers: { 'User-Agent': ctx.userAgent },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw new Error(`${url} answered ${res.status}`)
    return res
  }

  #build(): void {
    const list = this.#source.episodes
    this.#episodes = list.map(pageEpisode)
    this.#urls = new Map(list.map((e, i) => [this.#episodes[i].id, e.url]))
  }

  #data(): MfpEpisodes {
    const c = this.#source.cover
    const cover = c && { hash: c.hash, palette: c.palette, ...(c.small ? { small: true } : {}) }
    return cover ? { episodes: this.#episodes, cover } : { episodes: this.#episodes }
  }

  start(ctx: PluginContext): void {
    this.#ctx = ctx
    ctx.page.handle(MfpChannel.get, () =>
      this.#status ? { ...this.#data(), status: this.#status } : this.#data()
    )
    ctx.page.on(MfpChannel.refresh, () => void this.#source.refresh(true))
    // Only mp3s from mfp.json are fetched: the page names an episode, never a URL.
    ctx.route('mfp', (req, url, parts) => {
      const mp3 = this.#on && parts.length === 1 ? this.#urls.get(parts[0]) : undefined
      if (!mp3) return notFound()
      return onlineMedia(mp3, req, url.searchParams.has('decode'), {
        fetch: ctx.fetch,
        userAgent: ctx.userAgent,
        log: (t) => this.o.log(`spindle://mfp/${parts[0]}: ${t}`)
      })
    })
  }

  setOn(on: boolean): void {
    if (on === this.#on) return
    this.#on = on
    void this.#source.setOn(on)
  }

  keptCovers(): string[] {
    const c = this.#source.cover
    return c ? [...new Set([...this.#made, c.hash])] : [...this.#made]
  }

  flushSync(): void {
    this.#writer?.flushSync()
  }
}
