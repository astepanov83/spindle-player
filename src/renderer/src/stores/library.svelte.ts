// Library data plus view state. The view state lives here, not in the part,
// so a layout rebuild keeps the open album, search, sort and section.
import type { Album, Playlist, Track } from '../../../shared/library'
import { makeFakeLibrary } from '../library/fake-data'
import type { Sort } from '../library/views'

export type Chip = 'albums' | 'artists' | 'folders' | 'playlists'
// sidebar sections; playlists are "pl:<id>"
export type Section = 'songs' | 'albums' | 'artists' | 'folders' | `pl:${string}`

class LibraryStore {
  // plain arrays, not deep proxies: they can hold 50k+ songs
  albums: Album[] = $state.raw([])
  playlists: Playlist[] = $state.raw([])
  #tracks = new Map<string, Track>()
  #order = new Map<string, number>()
  #albumIndex = new Map<string, number>()

  chip: Chip = $state('albums')
  section: Section = $state('songs')
  // album id of the open album page, or null for the grid
  open: string | null = $state(null)
  query = $state('')
  sort: Sort = $state({ k: 'a', dir: 1 })

  load(data: { albums: Album[]; tracks: Track[]; playlists: Playlist[] }): void {
    this.#tracks = new Map(data.tracks.map((t) => [t.id, t]))
    this.#order = new Map(data.tracks.map((t, i) => [t.id, i]))
    this.#albumIndex = new Map(data.albums.map((a, i) => [a.id, i]))
    this.albums = data.albums
    this.playlists = data.playlists
  }

  track(id: string): Track {
    return this.#tracks.get(id)!
  }

  album(id: string): Album {
    return this.albums[this.#albumIndex.get(id)!]
  }

  // position in the library, for stable sorting
  order(t: Track): number {
    return this.#order.get(t.id) ?? 0
  }

  // the album after this song's album, wrapping around
  nextAlbumTracks(trackId: string): string[] {
    const i = this.#albumIndex.get(this.track(trackId).albumId) ?? -1
    return this.albums[(i + 1) % this.albums.length]?.trackIds ?? []
  }
}

export const library = new LibraryStore()
library.load(makeFakeLibrary())
