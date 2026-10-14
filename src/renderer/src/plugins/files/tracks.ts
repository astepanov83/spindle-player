// Answers about songs of the library store.
import { genreKey } from '../../../../shared/genres'
import { songYear, type Art, type Track } from '../../../../shared/library'
import { itemKey, type ItemKey } from '../../../../shared/plugins/items'
import { genreText } from '../../library/views'
import { isLooseId, type LooseSong } from '../../../../shared/plugins/files/loose'
import { artistLinks } from './artists'
import { rootName } from './folders'
import { genrePage } from './pages'
import { files } from './store.svelte'
import { loose } from './loose.svelte'
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

// a song's "Go to ... genre" entries at most
const maxGenreLinks = 3

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
  readonly genre: string | undefined
  readonly codec: string
  readonly #t: Track

  constructor(t: Track) {
    this.#t = t
    this.title = t.title
    this.subtitle = t.artist
    this.group = t.album
    this.length = t.duration
    this.genre = genreText(t) || undefined
    this.codec = t.codec
  }

  get added(): number | undefined {
    return files.findAlbum(this.#t.albumId)?.added || undefined
  }

  // read when asked: the album's year can change under the same song
  get year(): number | undefined {
    return songYear(this.#t, files.findAlbum(this.#t.albumId)) || undefined
  }

  get art(): Art | undefined {
    return files.art(this.#t)
  }

  get unavailable(): string | undefined {
    const root = files.missingRoot(this.#t)
    return root && `Folder not found: ${rootName(root)}`
  }

  get groupArtist(): string | undefined {
    return files.findAlbum(this.#t.albumId)?.artist
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
      ),
      ...this.#genreLinks()
    ]
  }

  // its genres' pages (ticket 123), the first few: a song can carry many
  #genreLinks(): { label: string; to: PageAddress }[] {
    const pages = (this.#t.genre ?? []).flatMap((name) => {
      const g = files.getGenre(genreKey(name))
      return g ? [{ name: g.name, page: genrePage(g.key) }] : []
    })
    const many = pages.length > 1
    return pages.slice(0, maxGenreLinks).map((g) => ({
      label: many ? `Go to ${g.name} genre` : 'Go to genre',
      to: { plugin: 'files', page: g.page }
    }))
  }
}

// The song menu's entry for a song not in the library (act's id)
export const showFileId = 'show-file'

// A song not in the library (ticket 124): no album or artist pages to link to,
// only its file to show.
class LooseInfo implements ItemInfo {
  readonly title: string
  readonly subtitle: string
  readonly group: string
  readonly length: number
  readonly codec: string
  readonly art: Art | undefined
  readonly names: { name: string }[]
  readonly menu = [{ id: showFileId, label: 'Show in file manager' }]

  constructor(t: Track) {
    this.title = t.title
    this.subtitle = t.artist
    this.group = t.album
    this.length = t.duration
    this.codec = t.codec
    this.art = t.art
    this.names = artistLinks(t, () => false).map(({ name }) => ({ name }))
  }
}

const looseAnswers = new WeakMap<LooseSong, ItemState>()

function looseState(id: string): ItemState {
  const s = loose.find(id)
  if (!s) return loose.gone(id) ? missing : loading
  let a = looseAnswers.get(s)
  if (!a) looseAnswers.set(s, (a = { state: 'ok', info: new LooseInfo(s.track) }))
  return a
}

// `complete`: the plugin's data is all there, so a song not in it is gone.
// Asked only then, so a found song doesn't follow what it reads.
export function trackState(id: string, complete: () => boolean): ItemState {
  if (isLooseId(id)) return looseState(id)
  const t = files.find(id)
  if (!t) return complete() ? missing : loading
  let s = answers.get(t)
  if (!s) answers.set(t, (s = { state: 'ok', info: new TrackInfo(t) }))
  return s
}

export function trackPlayable(id: string): Playable | undefined {
  const s = isLooseId(id) ? loose.find(id) : undefined
  const t = s ? s.track : files.find(id)
  if (!t) return undefined
  const p: Playable = {
    url: mediaUrl(s ? s.file : (t.part?.file ?? t.id)),
    length: t.duration,
    can
  }
  if (t.part) p.part = t.part
  if (t.codec) p.codec = t.codec
  if (t.gain) p.gain = t.gain
  if (t.rate) p.rate = t.rate
  return p
}
