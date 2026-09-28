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
    const f = (await probe.tags(m.path)).format
    let duration = f.duration ?? m.duration
    if (lengthMayBeGuessed(f.container)) duration = (await probe.length(m.path)) ?? duration
    if (!f.sampleRate || !f.numberOfChannels || !(duration > 0)) return undefined
    const plan = { format: wavFormat(f.sampleRate, f.numberOfChannels, f.bitsPerSample), duration }
    if (this.#cache.size >= this.limit) this.#cache.clear()
    this.#cache.set(key, plan)
    return plan
  }
}
