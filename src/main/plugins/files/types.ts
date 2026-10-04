// The library index on disk, and the messages between main and the library process.
import type { IdMoves } from '../../../shared/id-moves'
import type { ScanStatus } from '../../../shared/library'
import type { ArtistChanges } from '../../../shared/plugins/files/artist-overrides'
import type { CoverSource } from '../../../shared/settings'
import type { ThemePalettes } from '../../../shared/palette'
import type { CueSheet } from './cue'

// One audio file. Tags are already cleaned up (see tags.ts); a missing tag is left out.
export interface FileEntry {
  path: string
  // last change time in ms, and size in bytes; a file with both unchanged is not read again
  mtime: number
  size: number
  title?: string
  artist?: string
  albumArtist?: string
  album?: string
  track?: number
  disc?: number
  year?: number
  genre?: string
  // seconds, 0 when unknown
  duration: number
  codec?: string
  container?: string
  // Kept only for files Chromium can't play, which ffmpeg decodes to WAV
  // (see needsDecoding in tags.ts)
  sampleRate?: number
  channels?: number
  bits?: number
  // hash of the embedded cover picture
  cover?: string
  // MusicBrainz ids from the tags, for an exact cover lookup (ticket 014)
  mbReleaseGroup?: string
  mbRelease?: string
  // set when the tags could not be read; the file is still listed by its name
  error?: string
}

// A cover.jpg (or folder.jpg, front.png...) found in a folder.
export interface FolderImage {
  path: string
  // the folder it is the cover of, when not the one it is in (a Scans subfolder)
  dir?: string
  mtime: number
  size: number
  // hash of the image bytes, or '' before it is read
  cover: string
}

// A .cue sheet. No sheet when it has no audio tracks or could not be read.
export interface CueEntry {
  path: string
  mtime: number
  size: number
  sheet?: CueSheet
  // which cue reader made it; see cueReaderVersion (missing means 1)
  reader?: number
}

export interface LibraryIndex {
  version: number
  // which tag reader made the entries; see readerVersion
  reader: number
  files: Map<string, FileEntry>
  cues: Map<string, CueEntry>
  // folder path -> its cover image
  images: Map<string, FolderImage>
  // cover hash -> the album colors picked from it
  palettes: Map<string, ThemePalettes>
  // Colors picked by an older paletteVersion, shown until the cover's are
  // picked again, so a version bump doesn't turn every album grey for a scan.
  stalePalettes: Map<string, ThemePalettes>
  // Track ids that changed (moves.ts) and that main has not said are in
  // playlists.json and queue.json yet. Saved with the moved entries, so a
  // crash in between sends them again on the next start.
  pendingMoves: IdMoves
}

// Bump to make every file be read again (for example when a new tag is added).
export const indexVersion = 1
// 2: ffprobe reads what music-metadata can't (ticket 012).
// 3: MusicBrainz release ids are kept (ticket 014).
// Every file an older reader read is read again once.
export const readerVersion = 3
// 2: a non-UTF-8 sheet may be cp1252, not only cp1251 (ticket 011). Every
// sheet from an older reader is read again once.
export const cueReaderVersion = 2

export interface WorkerStart {
  indexPath: string
  coversDir: string
  // for the status before the first scan
  folders: string[]
  // the bundled ffprobe, for files music-metadata can't read; none if missing
  ffprobe?: string
  // old id -> new id of songs moved earlier this run, so a restarted process
  // still serves a song playing under its old id
  aliases?: IdMoves
  // the online cover lookup setting, and where its results are kept (ticket 014)
  fetch: { on: boolean; sources: Record<CoverSource, boolean> }
  fetchedPath: string
  // artist names changed by hand (ticket 024)
  overridesPath: string
  // sent with every online request
  userAgent: string
  // covers main uses that the index does not know: station logos (ticket 030)
  keepCovers: string[]
  // Music files is on (see 'set-on')
  on: boolean
}

// What main needs to serve a file: its path, and for a file ffmpeg decodes,
// the WAV it makes.
export interface MediaInfo {
  path: string
  codec?: string
  duration: number
  sampleRate?: number
  channels?: number
  bits?: number
}

// main to the library process
export type WorkerIn =
  // always the first message; the process waits for it
  | { type: 'start'; start: WorkerStart }
  // retryFailed: read files that failed last time again (a manual Rescan).
  // id comes back with 'scanned' when the scan ends.
  | { type: 'scan'; id: number; folders: string[]; retryFailed: boolean }
  // a picture sent with 'cover' is written (ok), can't be decoded (bad),
  // or went unanswered (retry: try again on a later scan)
  // rebuild: a cached small cover that can't be decoded was deleted; make it again
  | {
      type: 'cover-done'
      hash: string
      result: 'ok' | 'bad' | 'retry' | 'rebuild'
      palette?: ThemePalettes
    }
  // the page's library as it is now, as JSON bytes in the reply
  | { type: 'get-library'; req: number }
  // quitting: save the index now, then answer 'flushed'
  | { type: 'flush' }
  // the id map sent with 'ids-moved' is in playlists.json and queue.json
  | { type: 'ids-saved'; moves: IdMoves }
  // a song is playing: the scan slows down so the audio gets the disk first.
  // dev: the playing file's device, so a scan of another disk keeps its speed
  | { type: 'playing'; playing: boolean; dev?: number }
  // the app window closed: stop the scan running, keeping what it read
  | { type: 'stop' }
  | { type: 'find-track'; req: number; id: string }
  // the source picture of a cover, to make the large size
  | { type: 'cover-source'; req: number; hash: string }
  // the online cover lookup setting changed
  | { type: 'fetch-covers'; on: boolean; sources: Record<CoverSource, boolean> }
  // an app window is open again after 'stop'
  | { type: 'resume' }
  // the page renamed or split artists (ticket 024)
  | { type: 'artist-overrides'; changes: ArtistChanges }
  // the covers main uses changed (station logos); the prune keeps them
  | { type: 'keep-covers'; hashes: string[] }
  // the cover of a song playing on the radio (ticket 032), looked up only
  // while the online cover setting is on; answered with `song`
  | { type: 'song-cover'; req: number; artist: string; song: string }
  // main gave up on an ask (a new title came): stop it
  | { type: 'cancel'; req: number }
  // Music files turned on or off. Off: no scan, no album or artist lookup, and
  // no writes to the index, fetched-covers.json or artist-overrides.json.
  // Song cover lookups for the radio go on.
  | { type: 'set-on'; on: boolean }

// the library process to main
export type WorkerOut =
  // a changed library as JSON bytes: main passes them on without reading them
  | { type: 'library'; bytes: Uint8Array }
  | { type: 'status'; status: ScanStatus }
  // a picture main should resize into the cover cache and pick the palette of;
  // with paletteOnly, a cached small cover that only needs its palette
  | { type: 'cover'; hash: string; data: Uint8Array; paletteOnly?: boolean }
  // song: a song cover lookup's outcome; found comes with the picture in data
  | {
      type: 'reply'
      req: number
      media?: MediaInfo
      data?: Uint8Array
      song?: 'found' | 'none' | 'later'
    }
  | { type: 'log'; text: string }
  | { type: 'flushed' }
  // a scan ran to the end or failed; a stopped one sends nothing
  | { type: 'scanned'; id: number }
  // track ids that changed because their files are now reached by another
  // path; sent before the library with the new ids, and again at start until
  // main answers 'ids-saved'
  | { type: 'ids-moved'; moves: IdMoves }
