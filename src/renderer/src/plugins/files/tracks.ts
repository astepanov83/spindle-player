// Answers about songs of the library store. MFP songs are library tracks too
// until ticket 061, so the mfp page half uses this as well.
import type { Art, Track } from '../../../../shared/library'
import type { PluginId } from '../../../../shared/plugins'
import { itemKey, type ItemKey } from '../../../../shared/plugins/items'
import { artistLinks } from '../../library/artists'
import { library } from '../../stores/library.svelte'
import type { ItemInfo, ItemState, PageAddress, Playable } from '../types'

// Main serves indexed files by id (src/main/library/protocol.ts), MFP's mp3s too.
function mediaUrl(fileId: string): string {
  return `spindle://media/${fileId}`
}

const missing: ItemState = { state: 'missing' }
const loading: ItemState = { state: 'loading' }
const can = { seek: true, pause: true, next: true, previous: true }

export function pluginOf(t: Track): PluginId {
  return t.online === 'mfp' ? 'mfp' : 'files'
}

export function trackKey(t: Track): ItemKey {
  return itemKey(pluginOf(t), t.id)
}

// A song the library doesn't have counts as a file's.
export function trackKeys(ids: string[]): ItemKey[] {
  return ids.map((id) => {
    const t = library.find(id)
    return itemKey(t ? pluginOf(t) : 'files', id)
  })
}

// The library's song for a key of the files or mfp plugin.
export function trackOf(key: ItemKey | undefined): Track | undefined {
  if (!key) return undefined
  const at = key.indexOf(':')
  const t = library.find(key.slice(at + 1))
  return t && pluginOf(t) === key.slice(0, at) ? t : undefined
}

// The library's song for an id of `plugin`.
function find(plugin: PluginId, id: string): Track | undefined {
  const t = library.find(id)
  return t && pluginOf(t) === plugin ? t : undefined
}

// Kept by song object: the library replaces a song that changes and never
// edits one, so an answer can't go stale. Its picture and links are read when
// asked, since the album and artists can change under the same song.
const answers = new WeakMap<Track, ItemState>()

// A class, not an object with getters: the queue reads `length` of 50k of
// them, and fields stay fast to read with the getters on the prototype.
class TrackInfo implements ItemInfo {
  readonly title: string
  readonly subtitle: string
  readonly group: string
  readonly length: number
  readonly #t: Track

  constructor(t: Track) {
    this.#t = t
    this.title = t.title
    this.subtitle = t.artist
    this.group = t.album
    this.length = t.duration
  }

  get art(): Art | undefined {
    return library.art(this.#t)
  }

  get groupTo(): PageAddress {
    const plugin = pluginOf(this.#t)
    return { plugin, page: `${plugin === 'mfp' ? 'episode' : 'album'}/${this.#t.albumId}` }
  }

  // the album, at the song
  get titleTo(): PageAddress {
    return { ...this.groupTo, item: this.#t.id }
  }

  get names(): { name: string; to?: PageAddress }[] {
    return artistLinks(this.#t, (key) => !!library.getArtist(key)).map(({ name, key }) =>
      key ? { name, to: { plugin: 'files', page: `artist/${key}` } } : { name }
    )
  }

  // an MFP song's artists are not in Artists (ticket 052)
  get links(): { label: string; to: PageAddress }[] {
    const artists = pluginOf(this.#t) === 'mfp' ? [] : this.names
    const many = artists.length > 1
    return [
      { label: 'Go to album', to: this.titleTo },
      ...artists.flatMap((a) =>
        a.to ? [{ label: many ? `Go to ${a.name}` : 'Go to artist', to: a.to }] : []
      )
    ]
  }
}

// `complete`: the plugin's data is all there, so a song not in it is gone.
// Asked only then, so a found song doesn't follow what it reads.
export function trackState(plugin: PluginId, id: string, complete: () => boolean): ItemState {
  const t = find(plugin, id)
  if (!t) return complete() ? missing : loading
  let s = answers.get(t)
  if (!s) answers.set(t, (s = { state: 'ok', info: new TrackInfo(t) }))
  return s
}

export function trackPlayable(plugin: PluginId, id: string): Playable | undefined {
  const t = find(plugin, id)
  if (!t) return undefined
  const p: Playable = { url: mediaUrl(t.part?.file ?? t.id), length: t.duration, can }
  if (t.part) p.part = t.part
  if (t.codec) p.codec = t.codec
  return p
}
