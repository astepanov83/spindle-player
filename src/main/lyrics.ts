// The page's one lyrics request (tickets 120, 121): the words of the song that
// starts, asked once per song. The song's own plugin reads its files first
// (an .lrc, the tags); sources added after it (an online lookup) are asked
// only when it has none, in the order they were added.
import type { Lyrics, LyricsSong } from '../shared/lyrics'
import type { PluginId } from '../shared/plugins'
import { splitKey, type ItemKey } from '../shared/plugins/items'

// What the page asks for: the song, and what it shows of it.
export interface LyricsAsk {
  key: ItemKey
  song?: LyricsSong
}

// A plugin's own words for one of its items, by the item's id.
export type LocalLyrics = (id: string, signal: AbortSignal) => Promise<Lyrics | undefined>
// A source for any song, asked after the plugin's own.
export type LyricsSource = (ask: LyricsAsk, signal: AbortSignal) => Promise<Lyrics | undefined>

// What a plugin gets in its context: a place for its own reader.
export interface LyricsProvider {
  provide(read: LocalLyrics): void
}

export class LyricsService {
  #local = new Map<PluginId, LocalLyrics>()
  #after: LyricsSource[] = []
  // the song asked last; a new one stops it
  #asking: AbortController | undefined

  constructor(private readonly log: (text: string) => void = () => {}) {}

  // The provider a plugin's context gets.
  providerFor(plugin: PluginId): LyricsProvider {
    return { provide: (read) => this.#local.set(plugin, read) }
  }

  add(source: LyricsSource): void {
    this.#after.push(source)
  }

  // Undefined when no source has words for it, or a newer song was asked meanwhile.
  async get(ask: LyricsAsk): Promise<Lyrics | undefined> {
    this.#asking?.abort()
    const asking = new AbortController()
    this.#asking = asking
    const { signal } = asking
    const k = splitKey(ask.key)
    const local = k && this.#local.get(k.plugin)
    const sources: LyricsSource[] = [
      ...(local && k ? [() => local(k.id, signal)] : []),
      ...this.#after
    ]
    try {
      for (const source of sources) {
        if (signal.aborted) return undefined
        const got = await source(ask, signal).catch((e: unknown) => {
          if (!signal.aborted) this.log(`Lyrics for ${ask.key} not read: ${e}`)
          return undefined
        })
        if (got) return signal.aborted ? undefined : got
      }
      return undefined
    } finally {
      if (this.#asking === asking) this.#asking = undefined
    }
  }
}
