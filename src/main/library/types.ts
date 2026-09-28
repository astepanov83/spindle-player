// The library index on disk, and the messages between main and the library process.
import type { IdMoves } from '../../shared/id-moves'
import type { ScanStatus } from '../../shared/library'
import type { ThemePalettes } from '../../shared/palette'
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
  // set when the tags could not be read; the file is still listed by its name
  error?: string
}

// A cover.jpg (or folder.jpg, front.png...) found in a folder.
export interface FolderImage {
  path: string
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
  // Track ids that changed (moves.ts) and that main has not said are in
  // playlists.json and queue.json yet. Saved with the moved entries, so a
  // crash in between sends them again on the next start.
  pendingMoves: IdMoves
}

// Bump to make every file be read again (for example when a new tag is added).
export const indexVersion = 1
// 2: ffprobe reads what music-metadata can't (ticket 012). Entries from an
// older reader that failed or have no title are read again once.
export const readerVersion = 2

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

// the library process to main
export type WorkerOut =
  // a changed library as JSON bytes: main passes them on without reading them
  | { type: 'library'; bytes: Uint8Array }
  | { type: 'status'; status: ScanStatus }
  // a picture main should resize into the cover cache and pick the palette of;
  // with paletteOnly, a cached small cover that only needs its palette
  | { type: 'cover'; hash: string; data: Uint8Array; paletteOnly?: boolean }
  | { type: 'reply'; req: number; media?: MediaInfo; data?: Uint8Array }
  | { type: 'log'; text: string }
  | { type: 'flushed' }
  // a scan ran to the end or failed; a stopped one sends nothing
  | { type: 'scanned'; id: number }
  // track ids that changed because their files are now reached by another
  // path; sent before the library with the new ids, and again at start until
  // main answers 'ids-saved'
  | { type: 'ids-moved'; moves: IdMoves }
