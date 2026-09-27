// Builds the albums and tracks the page shows from the index.
import { hash } from 'crypto'
import { basename } from 'path'
import { defaultPalette, type Album, type LibraryData, type Track } from '../../shared/library'
import { dirOf } from './merge'
import { isDiscFolder, titleFromFileName } from './tags'
import type { FileEntry, LibraryIndex } from './types'

export interface BuiltLibrary {
  data: LibraryData
  // track id -> file path, for the media protocol
  paths: Map<string, string>
}

export const unknownArtist = 'Unknown artist'
export const variousArtists = 'Various Artists'

// Short and stable: the same path gives the same id on every start.
export function shortHash(s: string): string {
  // the one-shot hash() is about twice as fast as createHash for 50k paths
  return hash('sha1', s).slice(0, 16)
}

export function coverUrls(hash: string): { cover: string; coverLarge: string } {
  return { cover: `spindle://cover/small/${hash}`, coverLarge: `spindle://cover/large/${hash}` }
}

// The folder an album lives in: "Album/CD2" counts as "Album".
export function albumFolder(dir: string): string {
  return isDiscFolder(basename(dir)) ? dirOf(dir) : dir
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const lower = (s: string): string => s.toLocaleLowerCase()

// Tracks go together when they share the album folder and the album tag,
// and the album artist when there is one. A folder with no album tags is one album.
export function albumKey(e: FileEntry): string {
  const folder = albumFolder(dirOf(e.path))
  if (!e.album) return folder + '\0'
  return [folder, lower(e.album), lower(e.albumArtist ?? '')].join('\0')
}

// One file, with what sorting needs worked out once.
interface Item {
  e: FileEntry
  id: string
  name: string
  no: number
  fromName: string
}

interface Group {
  key: string
  items: Item[]
}

function byDiscAndNumber(a: Item, b: Item): number {
  return (
    (a.e.disc ?? 1) - (b.e.disc ?? 1) ||
    a.no - b.no ||
    (a.name === b.name ? 0 : collator.compare(a.name, b.name))
  )
}

function albumArtistOf(entries: FileEntry[]): string {
  const tagged = entries.find((e) => e.albumArtist)?.albumArtist
  if (tagged) return tagged
  const artists = new Set(entries.map((e) => e.artist).filter((a) => a !== undefined))
  if (artists.size === 1) return [...artists][0]
  // no album artist tag and several artists: a compilation
  return artists.size > 1 ? variousArtists : unknownArtist
}

// The most common year, the later one on a tie.
function yearOf(entries: FileEntry[]): number {
  const count = new Map<number, number>()
  for (const e of entries) if (e.year) count.set(e.year, (count.get(e.year) ?? 0) + 1)
  let best = 0
  let bestN = 0
  for (const [y, n] of count)
    if (n > bestN || (n === bestN && y > best)) {
      best = y
      bestN = n
    }
  return best
}

// The first embedded cover in track order, then the folder image.
function coverOf(
  entries: FileEntry[],
  ix: LibraryIndex,
  hasCover: (hash: string) => boolean
): string | undefined {
  for (const e of entries) if (e.cover && hasCover(e.cover)) return e.cover
  const dirs = [albumFolder(dirOf(entries[0].path)), ...entries.map((e) => dirOf(e.path))]
  for (const d of dirs) {
    const c = ix.images.get(d)?.cover
    if (c && hasCover(c)) return c
  }
  return undefined
}

function withoutTracks(al: Album & { tracks: Track[] }): Album {
  const out: Album & { tracks?: Track[] } = { ...al }
  delete out.tracks
  return out
}

export function buildLibrary(ix: LibraryIndex, hasCover: (hash: string) => boolean): BuiltLibrary {
  const groups = new Map<string, Group>()
  const paths = new Map<string, string>()
  for (const e of ix.files.values()) {
    const key = albumKey(e)
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { key, items: [] }))
    const name = basename(e.path)
    const fromName = e.title ? undefined : titleFromFileName(name)
    const id = shortHash(e.path)
    paths.set(id, e.path)
    g.items.push({
      e,
      id,
      name,
      no: e.track ?? fromName?.no ?? 0,
      fromName: fromName?.title ?? ''
    })
  }

  const albums: (Album & { tracks: Track[] })[] = []
  for (const g of groups.values()) {
    g.items.sort(byDiscAndNumber)
    const entries = g.items.map((it) => it.e)
    const first = entries[0]
    const id = shortHash(g.key)
    const title = first.album ?? basename(albumFolder(dirOf(first.path)))
    const artist = albumArtistOf(entries)
    const cover = coverOf(entries, ix, hasCover)
    const fallbackArtist = artist === variousArtists ? unknownArtist : artist
    const tracks = g.items.map(({ e, id: trackId, no, fromName }): Track => ({
      id: trackId,
      title: e.title ?? fromName,
      duration: e.duration,
      albumId: id,
      artist: e.artist ?? e.albumArtist ?? fallbackArtist,
      album: title,
      no,
      disc: e.disc ?? 1,
      codec: e.codec ?? ''
    }))
    albums.push({
      id,
      title,
      artist,
      year: yearOf(entries),
      palette: [...defaultPalette],
      ...(cover ? coverUrls(cover) : { cover: '', coverLarge: '' }),
      trackIds: tracks.map((t) => t.id),
      tracks
    })
  }

  albums.sort(
    (a, b) =>
      collator.compare(a.artist, b.artist) ||
      a.year - b.year ||
      collator.compare(a.title, b.title) ||
      (a.id < b.id ? -1 : 1)
  )

  const tracks: Track[] = []
  for (const al of albums) for (const t of al.tracks) tracks.push(t)
  return {
    data: { albums: albums.map(withoutTracks), tracks },
    paths
  }
}
