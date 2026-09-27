// The library index on disk, and the messages between main and the library worker.
import type { ScanStatus } from '../../shared/library'

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
}

// Bump to make every file be read again (for example when a new tag is added).
export const indexVersion = 1

export interface WorkerStart {
  indexPath: string
  coversDir: string
  // for the status before the first scan
  folders: string[]
  // one Int32 main waits on with Atomics while the worker saves at quit
  flushFlag: SharedArrayBuffer
}

// main to the library worker
export type WorkerIn =
  | { type: 'scan'; folders: string[] }
  // a picture sent with 'cover' is written (ok), can't be decoded (bad),
  // or went unanswered (retry: try again on a later scan)
  | { type: 'cover-done'; hash: string; result: 'ok' | 'bad' | 'retry' }
  // the page's library as it is now, as JSON bytes in the reply
  | { type: 'get-library'; req: number }
  // quitting: save the index now, then set the flush flag
  | { type: 'flush' }
  | { type: 'find-track'; req: number; id: string }
  // the source picture of a cover, to make the large size
  | { type: 'cover-source'; req: number; hash: string }

// the library worker to main
export type WorkerOut =
  // a changed library as JSON bytes: main passes them on without reading them
  | { type: 'library'; bytes: Uint8Array }
  | { type: 'status'; status: ScanStatus }
  // a picture main should resize into the cover cache
  | { type: 'cover'; hash: string; data: Uint8Array }
  | { type: 'reply'; req: number; path?: string; data?: Uint8Array }
  | { type: 'log'; text: string }
