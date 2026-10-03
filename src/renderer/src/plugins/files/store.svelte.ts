// The music files plugin's data: the library main sends from the index at
// start, then what changed while scans run (patches, see library-patch.ts),
// and the scan status. Also the view state of its own pages (folder and
// artist sorts, the artist being edited). Where the library is (tabs, pages,
// history, search text) is the core's: stores/library.svelte.ts.
import { listArtists, type Artist } from '../../../../shared/plugins/files/artists'
import type {
  Album,
  Art,
  ArtistPhoto,
  Folder,
  LibraryData,
  ScanStatus,
  Track
} from '../../../../shared/library'
import {
  applyPatch,
  type HeldLibrary,
  type LibraryMessage,
  type LibraryPatch,
  type LibraryVersion
} from '../../../../shared/plugins/files/library-patch'
import { nextPlaylistSort, type Sort, type SortKey } from '../../library/views'
import { emptyTree, folderTree, type FolderTree } from './folders'
import { library } from '../../stores/library.svelte'

// The same list when every album in it is the same object, so views made
// from it don't redo their work.
function keepSame(old: Album[], next: Album[]): Album[] {
  return old.length === next.length && old.every((a, i) => a === next[i]) ? old : next
}

class FilesStore {
  // plain arrays, not deep proxies: they can hold 50k+ songs
  // in the order main sent them
  albums: Album[] = $state.raw([])
  #tracks = new Map<string, Track>()
  #order = new Map<string, number>()
  #albumIndex = new Map<string, number>()
  // the folder table main sent, which folderTree is built from
  #folderTable: Folder[] = []
  folders: FolderTree = $state.raw(emptyTree())
  // name order (see shared/plugins/files/artists.ts)
  artists: Artist[] = $state.raw([])
  #artistIndex = new Map<string, number>()
  // artist key -> photo found online
  photos: Readonly<Record<string, ArtistPhoto>> = $state.raw({})
  // The maps above are plain, so Svelte can't see them change. Every reader
  // touches this, so a $derived that looked up a track runs again after a
  // load. Not bumped by a patch with only photos: the song lists sort 50k rows.
  #version = $state(0)
  // bumped by every library and patch, photos alone too (see revision)
  #loads = $state(0)

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
  // A library came from main this run: a song not in it is gone, not on its
  // way, unless it is `partial` (its first scan has not ended).
  loaded = $state(false)
  partial = $state(false)
  // The page could not get or read a library from main. Kept apart from the
  // status, which main sends often, so the next status doesn't hide it.
  loadFailed = $state(false)

  // Folders show songs in folder order until a column is clicked, like playlists.
  folderSort: Sort | null = $state(null)
  // "Also on" shows in library order until a column is clicked, like playlists.
  artistSort: Sort | null = $state(null)
  // the artist whose names are being edited (ticket 024)
  editingArtist: string | null = $state(null)
  // which library main sent last, so a patch is only put on the one it was made from
  sent: LibraryVersion | undefined

  load(data: LibraryData & Partial<LibraryVersion> & { partial?: true }): void {
    this.#tracks = new Map(data.tracks.map((t) => [t.id, t]))
    this.loaded = true
    this.partial = !!data.partial
    this.#show(
      { albums: data.albums, folders: data.folders ?? [], photos: data.artistPhotos ?? {} },
      true
    )
    if (data.epoch !== undefined && data.n !== undefined)
      this.sent = { epoch: data.epoch, n: data.n }
  }

  // Puts a patch on the library shown. Songs and albums that did not change
  // keep their objects, and the album list stays the same list when no album
  // changed, so the grid and tables don't redo more than they must. Throws
  // when it doesn't fit (the caller asks for the whole library then). Returns
  // whether songs left the library.
  patch(p: LibraryPatch): boolean {
    const held = applyPatch(
      { albums: this.albums, folders: this.#folderTable, photos: this.photos },
      this.#tracks,
      p
    )
    // a patch with only photos (the lookup found some) leaves the lists as they are
    const songs =
      p.tracks.length > 0 ||
      p.goneTracks.length > 0 ||
      held.albums !== this.albums ||
      held.folders !== this.#folderTable
    this.partial = !!p.partial
    this.#show(held, songs)
    this.sent = { epoch: p.epoch, n: p.n }
    return p.goneTracks.length > 0
  }

  // `songs`: songs, albums or folders changed, so the lists made from them
  // are made again
  #show(held: HeldLibrary, songs: boolean): void {
    this.photos = held.photos
    if (songs) {
      const albums = held.albums
      // library order is album order, then each album's own
      const ids = albums.flatMap((a) => a.trackIds)
      this.#order = new Map(ids.map((id, i) => [id, i]))
      this.#albumIndex = new Map(albums.map((a, i) => [a.id, i]))
      const kept = keepSame(this.albums, albums)
      if (kept !== this.albums) this.albums = kept
      this.#folderTable = held.folders
      const tracks = ids.map((id) => this.#tracks.get(id)!)
      this.folders = folderTree(held.folders, tracks, (id) => {
        const i = this.#albumIndex.get(id)
        return i === undefined ? '' : albums[i].cover
      })
      this.artists = listArtists(albums, (id) => this.#tracks.get(id)!)
      this.#artistIndex = new Map(this.artists.map((a, i) => [a.key, i]))
    }
    if (songs) this.#version++
    this.#loads++
    // the open pages may be gone after a rescan
    library.pagesChanged()
  }

  sortFolder(k: SortKey): void {
    this.folderSort = nextPlaylistSort(this.folderSort, k)
  }

  getArtist(key: string): Artist | undefined {
    const i = this.#artistIndex.get(key)
    return i === undefined ? undefined : this.artists[i]
  }

  sortArtist(k: SortKey): void {
    this.artistSort = nextPlaylistSort(this.artistSort, k)
  }

  // Bumped by every library the page gets, whole or a patch. A picture that
  // failed to show tries again after one, since a scan can make its small
  // file again at the same URL.
  get revision(): number {
    return this.#loads
  }

  has(id: string): boolean {
    void this.#version
    return this.#tracks.has(id)
  }

  track(id: string): Track {
    void this.#version
    return this.#tracks.get(id)!
  }

  // one lookup for "has" and "track": the queue asks for 50k songs
  find(id: string): Track | undefined {
    void this.#version
    return this.#tracks.get(id)
  }

  album(id: string): Album {
    void this.#version
    return this.albums[this.#albumIndex.get(id)!]
  }

  findAlbum(id: string): Album | undefined {
    void this.#version
    const i = this.#albumIndex.get(id)
    return i === undefined ? undefined : this.albums[i]
  }

  // the song's own picture, else its album's
  art(t: Track): Art {
    return t.art ?? this.album(t.albumId)
  }

  // position in the library, for stable sorting
  order(t: Track): number {
    void this.#version
    return this.#order.get(t.id) ?? 0
  }
}

export const files = new FilesStore()

// Main sends the library as UTF-8 JSON bytes (see LibraryApi).
export function decodeLibrary(bytes: Uint8Array): LibraryMessage {
  return JSON.parse(new TextDecoder().decode(bytes)) as LibraryMessage
}
