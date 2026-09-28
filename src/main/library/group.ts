// Builds the albums and tracks the page shows from the index.
import { basename } from 'path'
import type { Album, LibraryData, Track, TrackPart } from '../../shared/library'
import { defaultPalettes, fallbackPalettes, type ThemePalettes } from '../../shared/palette'
import { searchKey, type CoverQuery } from './cover-match'
import { cueTracks } from './cue-tracks'
import { fetchedCover, type Fetched } from './fetched-store'
import { shortHash } from './ids'
import { dirOf } from './merge'
import { discFolderNumber, isDiscFolder, titleFromFileName } from './tags'
import type { FileEntry, LibraryIndex } from './types'

export interface BuiltLibrary {
  data: LibraryData
  // file id -> file path, for the media protocol. Every file has one, also a
  // disc image that is listed as its cue tracks (they play it by its id).
  paths: Map<string, string>
  // albums with no picture of their own and an album tag, in library order,
  // for the online lookup (ticket 014)
  queries: CoverQuery[]
}

export const unknownArtist = 'Unknown artist'
export const variousArtists = 'Various Artists'

export { shortHash }

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
  disc: number
  no: number
  fromName: string
  part?: TrackPart
}

interface Group {
  key: string
  items: Item[]
}

// The disc tag, else the "CD2" folder the file is in, else 1.
export function discOf(e: FileEntry): number {
  return e.disc ?? discFolderNumber(basename(dirOf(e.path))) ?? 1
}

function byDiscAndNumber(a: Item, b: Item): number {
  return (
    a.disc - b.disc || a.no - b.no || (a.name === b.name ? 0 : collator.compare(a.name, b.name))
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

// The first MusicBrainz ids in track order.
function mbIds(entries: FileEntry[]): Pick<CoverQuery, 'mbReleaseGroup' | 'mbRelease'> {
  const out: Pick<CoverQuery, 'mbReleaseGroup' | 'mbRelease'> = {}
  const rg = entries.find((e) => e.mbReleaseGroup)?.mbReleaseGroup
  const rel = entries.find((e) => e.mbRelease)?.mbRelease
  if (rg) out.mbReleaseGroup = rg
  if (rel) out.mbRelease = rel
  return out
}

// The cover's colors. No cover: made-up colors from the album id, so albums
// don't all look the same grey. A cover whose palette isn't picked yet shows
// the one an older paletteVersion picked, or stays neutral for the moment
// (an index from before palettes), not a random color.
function paletteOf(ix: LibraryIndex, cover: string | undefined, id: string): ThemePalettes {
  const p = cover
    ? (ix.palettes.get(cover) ?? ix.stalePalettes.get(cover) ?? defaultPalettes)
    : fallbackPalettes(id)
  return { dark: [...p.dark], light: [...p.light] }
}

function withoutTracks(al: Album & { tracks: Track[] }): Album {
  const out: Album & { tracks?: Track[] } = { ...al }
  delete out.tracks
  return out
}

export function buildLibrary(
  ix: LibraryIndex,
  hasCover: (hash: string) => boolean,
  fetched: Fetched = new Map()
): BuiltLibrary {
  const groups = new Map<string, Group>()
  const paths = new Map<string, string>()
  const add = (e: FileEntry, id: string, part?: TrackPart): void => {
    const key = albumKey(e)
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { key, items: [] }))
    const name = basename(e.path)
    const fromName = e.title ? undefined : titleFromFileName(name)
    g.items.push({
      e,
      id,
      name,
      disc: discOf(e),
      no: e.track ?? fromName?.no ?? 0,
      fromName: fromName?.title ?? '',
      part
    })
  }
  // a disc image with a cue sheet is served by its own id, but listed as the sheet's tracks
  const cues = cueTracks(ix)
  for (const e of ix.files.values()) {
    const id = shortHash(e.path)
    paths.set(id, e.path)
    if (!cues.images.has(e.path)) add(e, id)
  }
  for (const c of cues.items) add(c.entry, c.id, c.part)

  const albums: (Album & { tracks: Track[] })[] = []
  const queries: CoverQuery[] = []
  for (const g of groups.values()) {
    g.items.sort(byDiscAndNumber)
    const entries = g.items.map((it) => it.e)
    const first = entries[0]
    const id = shortHash(g.key)
    const title = first.album ?? basename(albumFolder(dirOf(first.path)))
    const artist = albumArtistOf(entries)
    const local = coverOf(entries, ix, hasCover)
    const key = first.album ? searchKey(artist, first.album) : ''
    // a picture found online comes last, so local ones always win
    const cover = local ?? (key ? fetchedCover(fetched, id, key, hasCover) : undefined)
    if (!local && first.album)
      queries.push({
        albumId: id,
        artist,
        album: first.album,
        year: yearOf(entries),
        tracks: g.items.length,
        compilation: artist === variousArtists,
        noArtist: artist === unknownArtist,
        key,
        ...mbIds(entries)
      })
    const fallbackArtist = artist === variousArtists ? unknownArtist : artist
    const tracks = g.items.map(({ e, id: trackId, disc, no, fromName, part }): Track => {
      const t: Track = {
        id: trackId,
        title: e.title ?? fromName,
        duration: e.duration,
        albumId: id,
        artist: e.artist ?? e.albumArtist ?? fallbackArtist,
        album: title,
        no,
        disc,
        codec: e.codec ?? ''
      }
      if (part) t.part = part
      if (e.cover && e.cover !== cover && hasCover(e.cover))
        t.art = { palette: paletteOf(ix, e.cover, id), ...coverUrls(e.cover) }
      return t
    })
    albums.push({
      id,
      title,
      artist,
      year: yearOf(entries),
      palette: paletteOf(ix, cover, id),
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
  const order = new Map(albums.map((a, i) => [a.id, i]))
  queries.sort((a, b) => order.get(a.albumId)! - order.get(b.albumId)!)
  return {
    data: { albums: albums.map(withoutTracks), tracks },
    paths,
    queries
  }
}
