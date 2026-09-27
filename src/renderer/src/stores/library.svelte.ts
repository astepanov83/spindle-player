// Library data plus view state. The view state lives here, not in the part,
// so a layout rebuild keeps the open album, search, sort and section.
// Main sends the data (from the index, then after each scan that changed something).
import type { Album, LibraryData, Playlist, ScanStatus, Track } from '../../../shared/library'
import type { Sort } from '../library/views'

export type Chip = 'albums' | 'artists' | 'folders' | 'playlists'
// sidebar sections; playlists are "pl:<id>"
export type Section = 'songs' | 'albums' | 'artists' | 'folders' | `pl:${string}`

class LibraryStore {
  // plain arrays, not deep proxies: they can hold 50k+ songs
  albums: Album[] = $state.raw([])
  // ticket 007 adds playlists
  playlists: Playlist[] = $state.raw([])
  #tracks = new Map<string, Track>()
  #order = new Map<string, number>()
  #albumIndex = new Map<string, number>()
  // The maps above are plain, so Svelte can't see them change. Every reader
  // touches this, so a $derived that looked up a track runs again after a load.
  #version = $state(0)

  status: ScanStatus = $state.raw({
    folders: [],
    phase: 'idle',
    done: 0,
    total: 0,
    tracks: 0,
    albums: 0,
    failed: 0,
    missing: []
  })

  chip: Chip = $state('albums')
  section: Section = $state('songs')
  // album id of the open album page, or null for the grid
  open: string | null = $state(null)
  query = $state('')
  sort: Sort = $state({ k: 'a', dir: 1 })

  load(data: LibraryData): void {
    this.#tracks = new Map(data.tracks.map((t) => [t.id, t]))
    this.#order = new Map(data.tracks.map((t, i) => [t.id, i]))
    this.#albumIndex = new Map(data.albums.map((a, i) => [a.id, i]))
    this.albums = data.albums
    this.#version++
    // the open album may be gone after a rescan
    if (this.open && !this.#albumIndex.has(this.open)) this.open = null
  }

  has(id: string): boolean {
    void this.#version
    return this.#tracks.has(id)
  }

  track(id: string): Track {
    void this.#version
    return this.#tracks.get(id)!
  }

  album(id: string): Album {
    void this.#version
    return this.albums[this.#albumIndex.get(id)!]
  }

  // position in the library, for stable sorting
  order(t: Track): number {
    void this.#version
    return this.#order.get(t.id) ?? 0
  }

  // the album after this song's album, wrapping around
  nextAlbumTracks(trackId: string): string[] {
    const i = this.#albumIndex.get(this.track(trackId).albumId) ?? -1
    return this.albums[(i + 1) % this.albums.length]?.trackIds ?? []
  }
}

export const library = new LibraryStore()

// Main sends the library as UTF-8 JSON bytes (see LibraryApi).
export function decodeLibrary(bytes: Uint8Array): LibraryData {
  return JSON.parse(new TextDecoder().decode(bytes)) as LibraryData
}
