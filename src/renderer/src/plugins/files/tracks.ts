// Answers about songs of the library store.
import type { Art, Track } from '../../../../shared/library'
import { itemKey, type ItemKey } from '../../../../shared/plugins/items'
import { artistLinks } from '../../library/artists'
import { files } from './store.svelte'
import type { ItemInfo, ItemState, PageAddress, Playable } from '../types'

// Main serves indexed files by id (src/main/plugins/files/protocol.ts).
function mediaUrl(fileId: string): string {
  return `spindle://media/${fileId}`
}

const missing: ItemState = { state: 'missing' }
const loading: ItemState = { state: 'loading' }
const can = { seek: true, pause: true, next: true, previous: true }

const prefix = 'files:'

export function trackKey(t: Track): ItemKey {
  return itemKey('files', t.id)
}

export function trackKeys(ids: string[]): ItemKey[] {
  return ids.map((id) => itemKey('files', id))
}

// The library's song for a key of the files plugin.
export function trackOf(key: ItemKey | undefined): Track | undefined {
  return key?.startsWith(prefix) ? files.find(key.slice(prefix.length)) : undefined
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
    return files.art(this.#t)
  }

  get groupTo(): PageAddress {
    return { plugin: 'files', page: `album/${this.#t.albumId}` }
  }

  // the album, at the song
  get titleTo(): PageAddress {
    return { ...this.groupTo, item: this.#t.id }
  }

  get names(): { name: string; to?: PageAddress }[] {
    return artistLinks(this.#t, (key) => !!files.getArtist(key)).map(({ name, key }) =>
      key ? { name, to: { plugin: 'files', page: `artist/${key}` } } : { name }
    )
  }

  get links(): { label: string; to: PageAddress }[] {
    const artists = this.names
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
export function trackState(id: string, complete: () => boolean): ItemState {
  const t = files.find(id)
  if (!t) return complete() ? missing : loading
  let s = answers.get(t)
  if (!s) answers.set(t, (s = { state: 'ok', info: new TrackInfo(t) }))
  return s
}

export function trackPlayable(id: string): Playable | undefined {
  const t = files.find(id)
  if (!t) return undefined
  const p: Playable = { url: mediaUrl(t.part?.file ?? t.id), length: t.duration, can }
  if (t.part) p.part = t.part
  if (t.codec) p.codec = t.codec
  return p
}
