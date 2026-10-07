// Library types, as the page sees them. Main builds them from the index (ticket 006).
import type { ThemePalettes } from './palette'

export interface Track {
  id: string
  title: string
  // seconds
  duration: number
  albumId: string
  // the tag, or what artists.json made of it (see ArtistCredit)
  artist: string
  artists?: string[]
  artistTag?: string
  grouped?: true
  album: string
  // track number, 1-based; 0 when unknown
  no: number
  // disc number, 1-based
  disc: number
  // e.g. "MPEG 1 Layer 3", "FLAC", "ALAC"; empty when unknown
  codec: string
  // set when the track is a stretch of a bigger file (a CUE sheet's disc image)
  part?: TrackPart
  // the song's own picture, set only when it differs from its album's
  // (compilations, singles folders); else the album's is shown
  art?: Art
  // index in LibraryData.folders: the folder the file is in (a cue track's
  // is the sheet's folder)
  folder: number
}

// A folder on disk that holds songs, or a folder above one. A number per
// song and one table of folders keep the JSON small (no path per song).
export interface Folder {
  // a music folder has its full path; the others their own name
  name: string
  // index of the parent in LibraryData.folders; -1 for a music folder
  parent: number
}

// An artist credit after artists.json (ticket 069): your renames and splits,
// and the AI's groups while that task is on. `artist` is what is shown: the
// tag, a new name, or the names of a split joined by ", ".
export interface ArtistCredit {
  artist: string
  // the names, only when a split made the tag several artists
  artists?: string[]
  // the tag as written, only when a link changed it
  artistTag?: string
  // set when the AI's links changed the tag (ticket 068), none of yours
  grouped?: true
}

// A cover and the colors picked from it. An Album is one too.
export interface Art {
  // [--c1, --c2, --c3] (main, accent, dark) for each theme, from the cover (ticket 009)
  palette: ThemePalettes
  // small cover URL for grids and lists, or '' when there is none
  cover: string
  // big cover URL for the stage, or ''
  coverLarge: string
}

// The page's addresses of a cover in the cache (spindle://cover, see protocol.ts).
export function coverUrls(hash: string): { cover: string; coverLarge: string } {
  return { cover: `spindle://cover/small/${hash}`, coverLarge: `spindle://cover/large/${hash}` }
}

// One picture of 4 small covers in a 2x2 square, for an artist's tile: one
// image to load instead of 4, so the Artists grid scrolls like the Albums one.
// Main makes it on first use. Undefined unless all 4 are small cached covers.
export function mosaicUrl(covers: string[]): string | undefined {
  if (covers.length !== 4) return undefined
  const hashes = covers.map((c) => /^spindle:\/\/cover\/small\/([0-9a-f]{40})$/.exec(c)?.[1])
  if (hashes.some((h) => !h)) return undefined
  return `spindle://cover/mosaic/${hashes.join('-')}`
}

// Where a track lies in its file, in seconds. `file` is the id the page loads
// (spindle://media/<file>), the same for every track of one image.
export interface TrackPart {
  file: string
  start: number
  // none for the last track: it runs to the end of the file
  end?: number
}

// Album artist credits that mean a compilation, folded to lower case. Cover
// and photo lookups skip them; the album page calls such an album a Compilation.
export const various: ReadonlySet<string> = new Set(['various artists', 'various', 'va'])

export function isVarious(credit: string): boolean {
  return various.has(credit.trim().toLowerCase())
}

export interface Album extends Art {
  id: string
  title: string
  // see ArtistCredit
  artist: string
  artists?: string[]
  artistTag?: string
  grouped?: true
  // 0 when unknown
  year: number
  trackIds: string[]
}

// An artist photo found online (ticket 021).
export type ArtistPhoto = Pick<Art, 'cover' | 'coverLarge'>

// What main sends the page. Albums and tracks are in library order. Folders
// come parents first, music folders in settings order, subfolders by name.
export interface LibraryData {
  albums: Album[]
  tracks: Track[]
  folders: Folder[]
  // artist key (see shared/plugins/files/artists.ts) -> photo; only artists with one
  artistPhotos?: Record<string, ArtistPhoto>
}

export type ScanPhase = 'idle' | 'walk' | 'read'

// Things looked up online: with a picture found, with none found, and still
// to look up.
export interface FetchCounts {
  found: number
  notFound: number
  left: number
}

// The online cover lookup (ticket 014): the counts are albums. running is
// true while it looks up covers or artist photos.
export interface FetchStatus extends FetchCounts {
  running: boolean
  // while running: what the lookup is on now, covers or artist photos
  phase?: 'covers' | 'photos'
  // artist photos (ticket 021); missing while Deezer is off
  artists?: FetchCounts
}

// The artist groups task (ticket 068), as the library process last ran it.
export type GroupsStatus =
  // step: splitting joint credits, then matching spellings (ticket 070);
  // checked: names asked about so far in this step, of total
  | { state: 'running'; step: 'split' | 'join'; checked: number; total: number }
  // what this run changed: tags now shown under another artist's name
  // (joined) and joint credits now split (split); at: when it ended (ms since 1970)
  | { state: 'done'; joined: number; split: number; at: number }
  // a rate or daily limit; at: when it goes on, when known
  | { state: 'limit'; at?: number }
  // stopped this run; the next finished scan tries again
  | { state: 'stopped'; error: 'network' | 'failed' }

export interface ScanStatus {
  folders: string[]
  phase: ScanPhase
  // files found so far (walk) or files read so far (read)
  done: number
  // files to read; 0 while walking
  total: number
  // files read so far while walking (tags are read as folders are listed)
  read?: number
  tracks: number
  albums: number
  // files whose tags could not be read in the last scan
  failed: number
  // folders that could not be read in the last scan, e.g. an unplugged drive
  missing: string[]
  // Main gave up on the library process for this run. not-loaded: it never
  // gave a library. stopped: it did, then stopped; songs no longer play.
  unavailable?: 'not-loaded' | 'stopped'
  // the last scan ended with an error (it is logged); the next scan clears it
  scanFailed?: boolean
  // settings.json could not be read, so the folders can't be changed or scanned this run
  settingsUnreadable?: boolean
  // the online cover lookup; missing while it is off
  fetch?: FetchStatus
  // missing while the task is off and before it first runs
  groups?: GroupsStatus
}
