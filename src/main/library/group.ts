// Builds the albums and tracks the page shows from the index.
import { basename } from 'path'
import { creditOf, type ArtistOverrides } from '../../shared/artist-overrides'
import { artistKey, listArtists, namesOf } from '../../shared/artists'
import {
  coverUrls,
  type Album,
  type ArtistPhoto,
  type LibraryData,
  type Track,
  type TrackPart
} from '../../shared/library'
import { defaultPalettes, fallbackPalettes, type ThemePalettes } from '../../shared/palette'
import { checksPerArtist, lookUpArtist, type ArtistCheck, type ArtistQuery } from './artist-photo'
import { cleanAlbum, cleanArtist, searchKey, type CoverQuery } from './cover-match'
import { cueTracks } from './cue-tracks'
import { fetchedCover, type Fetched } from './fetched-store'
import { folderTable } from './folders'
import { shortHash } from './ids'
import type { MfpEpisode } from './mfp'
import { mfpLibrary, type OnlineFile } from './mfp-library'
import { dirOf } from './merge'
import { discFolderNumber, isDiscFolder, titleFromFileName } from './tags'
import type { FileEntry, LibraryIndex } from './types'

export interface BuiltLibrary {
  data: LibraryData
  // file id -> file path, for the media protocol. Every file has one, also a
  // disc image that is listed as its cue tracks (they play it by its id).
  paths: Map<string, string>
  // file id -> an online mp3 (ticket 052)
  urls: Map<string, OnlineFile>
  // albums with no picture of their own and an album tag, in library order,
  // for the online lookup (ticket 014)
  queries: CoverQuery[]
  // artists to find a photo for, in name order (ticket 021)
  artists: ArtistQuery[]
}

export const unknownArtist = 'Unknown artist'
export const variousArtists = 'Various Artists'

export { shortHash }

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
  // the folder the Folders view lists it in
  dir: string
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

// A few of the artist's titles to check a found artist by: two of their
// albums, then their songs on other albums, then their own songs. Deezer
// lacks some albums in some countries but has a song of them elsewhere.
function checksOf(albums: Album[], also: Track[], songs: Track[]): ArtistCheck[] {
  const out: ArtistCheck[] = []
  const seen = new Set<string>()
  const add = (kind: ArtistCheck['kind'], title: string): void => {
    const c = cleanAlbum(title)
    if (!c || seen.has(kind + c) || out.length >= checksPerArtist) return
    seen.add(kind + c)
    out.push({ kind, title })
  }
  for (const al of albums.slice(0, 2)) add('album', al.title)
  for (const t of [...also, ...songs]) add('song', t.title)
  return out
}

// The artists of the Artists view to look up, and the photos found for them.
function artistsOf(
  albums: Album[],
  tracks: Track[],
  photos: Fetched,
  hasCover: (hash: string) => boolean
): { artists: ArtistQuery[]; artistPhotos: Record<string, ArtistPhoto> } {
  const byId = new Map(tracks.map((t) => [t.id, t]))
  const albumById = new Map(albums.map((a) => [a.id, a]))
  const artists: ArtistQuery[] = []
  const artistPhotos: Record<string, ArtistPhoto> = {}
  for (const a of listArtists(albums, (id) => byId.get(id)!)) {
    if (!lookUpArtist(a.name)) continue
    const key = cleanArtist(a.name)
    const photo = fetchedCover(photos, a.key, key, hasCover)
    if (photo) artistPhotos[a.key] = coverUrls(photo)
    const own = a.albums.map((id) => albumById.get(id)!)
    const songs = own
      .flatMap((al) => al.trackIds.map((id) => byId.get(id)!))
      .filter((t) => namesOf(t).some((n) => artistKey(n) === a.key))
    const checks = checksOf(
      own,
      a.also.map((id) => byId.get(id)!),
      songs
    )
    artists.push({ id: a.key, name: a.name, key, checks })
  }
  return { artists, artistPhotos }
}

// `roots` are the music folders, for the Folders view. `photos` are the
// artist photos found online, by artist key. `overrides` change the artist
// names shown (ticket 024); albums are still grouped and looked up online
// by the tags. `mfp` are the Music For Programming episodes and the site's
// picture (ticket 052): they come after the local music, with no folder and
// no artist lookup.
export function buildLibrary(
  ix: LibraryIndex,
  hasCover: (hash: string) => boolean,
  fetched: Fetched = new Map(),
  roots: string[] = [],
  photos: Fetched = new Map(),
  overrides: ArtistOverrides = new Map(),
  mfp: { episodes: MfpEpisode[]; cover?: string } = { episodes: [] }
): BuiltLibrary {
  const groups = new Map<string, Group>()
  const paths = new Map<string, string>()
  const add = (e: FileEntry, id: string, part?: TrackPart, dir = dirOf(e.path)): void => {
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
      part,
      dir
    })
  }
  // a disc image with a cue sheet is served by its own id, but listed as the sheet's tracks
  const cues = cueTracks(ix)
  for (const e of ix.files.values()) {
    const id = shortHash(e.path)
    paths.set(id, e.path)
    if (!cues.images.has(e.path)) add(e, id)
  }
  for (const c of cues.items) add(c.entry, c.id, c.part, c.dir)

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
        ...creditOf(e.artist ?? e.albumArtist ?? fallbackArtist, overrides),
        album: title,
        no,
        disc,
        codec: e.codec ?? '',
        // set below, once all folders are known
        folder: -1
      }
      if (part) t.part = part
      if (e.cover && e.cover !== cover && hasCover(e.cover))
        t.art = { palette: paletteOf(ix, e.cover, id), ...coverUrls(e.cover) }
      return t
    })
    albums.push({
      id,
      title,
      ...creditOf(artist, overrides),
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
  const dirs = new Map<string, string>()
  for (const g of groups.values()) for (const it of g.items) dirs.set(it.id, it.dir)
  const { folders, index } = folderTable(
    tracks.map((t) => dirs.get(t.id)!),
    roots
  )
  tracks.forEach((t, i) => (t.folder = index[i]))
  const order = new Map(albums.map((a, i) => [a.id, i]))
  queries.sort((a, b) => order.get(a.albumId)! - order.get(b.albumId)!)
  const shown = albums.map(withoutTracks)
  const { artists, artistPhotos } = artistsOf(shown, tracks, photos, hasCover)
  const cover = mfp.cover && hasCover(mfp.cover) ? mfp.cover : undefined
  const online = mfpLibrary(mfp.episodes, (id) => ({
    palette: paletteOf(ix, cover, id),
    ...(cover ? coverUrls(cover) : { cover: '', coverLarge: '' })
  }))
  return {
    data: {
      albums: [...shown, ...online.albums],
      tracks: [...tracks, ...online.tracks],
      folders,
      artistPhotos
    },
    paths,
    urls: online.urls,
    queries,
    artists
  }
}
