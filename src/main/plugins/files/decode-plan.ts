// The WAV format and length of a file ffmpeg decodes (see decode.ts).
import { wavFormat, type WavFormat } from './decode'
import { lengthMayBeGuessed } from './probe'
import type { RawTags } from './tags'
import type { MediaInfo } from './types'

export interface DecodePlan {
  format: WavFormat
  duration: number
}

// ffprobe, handed in so tests can fake it
export interface Prober {
  tags(path: string): Promise<RawTags>
  // the real length, reading the whole file
  length(path: string): Promise<number | undefined>
}

// The index has the format for files read since 012 whose format needs ffmpeg,
// and their lengths come from headers. Other files, and every file the page
// asked to decode (`forced`: its index length may be a guess from the bitrate,
// decision 79), are asked of ffprobe once per version of the file (`version`:
// mtime and size), so a changed file is asked again.
export class DecodePlans {
  #cache = new Map<string, DecodePlan>()
  // Runs in flight, keyed the same as the cache, so a HEAD next to a GET (or
  // two Range requests) share one ffprobe run instead of each starting their own.
  #pending = new Map<string, Promise<DecodePlan | undefined>>()

  constructor(readonly limit = 200) {}

  async get(
    m: MediaInfo,
    version: string,
    forced: boolean,
    probe: Prober | undefined
  ): Promise<DecodePlan | undefined> {
    if (!forced && m.sampleRate && m.channels && m.duration > 0)
      return { format: wavFormat(m.sampleRate, m.channels, m.bits), duration: m.duration }
    const key = `${m.path}\0${version}`
    const known = this.#cache.get(key)
    if (known) return known
    if (!probe) return undefined
    const running = this.#pending.get(key)
    if (running) return running
    const run = this.#run(key, m, probe).finally(() => this.#pending.delete(key))
    this.#pending.set(key, run)
    return run
  }

  async #run(key: string, m: MediaInfo, probe: Prober): Promise<DecodePlan | undefined> {
    const f = (await probe.tags(m.path)).format
    let duration = f.duration ?? m.duration
    if (lengthMayBeGuessed(f.container)) {
      try {
        duration = (await probe.length(m.path)) ?? duration
      } catch (e) {
        // The real length is only a nice-to-have; without it the song still
        // plays with the guessed duration, so it never has to be a 404.
        console.error(`Could not read the real length of ${m.path}, using the guess: ${e}`)
      }
    }
    if (!f.sampleRate || !f.numberOfChannels || !(duration > 0)) return undefined
    const plan = { format: wavFormat(f.sampleRate, f.numberOfChannels, f.bitsPerSample), duration }
    if (this.#cache.size >= this.limit) this.#cache.clear()
    this.#cache.set(key, plan)
    return plan
  }
}
