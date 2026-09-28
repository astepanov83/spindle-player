// The library index on disk, and the messages between main and the library process.
import type { ScanStatus } from '../../shared/library'
import type { ThemePalettes } from '../../shared/palette'

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

export interface LibraryIndex {
  version: number
  files: Map<string, FileEntry>
  // folder path -> its cover image
  images: Map<string, FolderImage>
  // cover hash -> the album colors picked from it
  palettes: Map<string, ThemePalettes>
}

// Bump to make every file be read again (for example when a new tag is added).
export const indexVersion = 1

export interface WorkerStart {
  indexPath: string
  coversDir: string
  // for the status before the first scan
  folders: string[]
}

// main to the library process
export type WorkerIn =
  // always the first message; the process waits for it
  | { type: 'start'; start: WorkerStart }
  // retryFailed: read files that failed last time again (a manual Rescan)
  | { type: 'scan'; folders: string[]; retryFailed: boolean }
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
  | { type: 'reply'; req: number; path?: string; data?: Uint8Array }
  | { type: 'log'; text: string }
  | { type: 'flushed' }
