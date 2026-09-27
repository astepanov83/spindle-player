// The library index on disk, and the messages between main and the scan worker.

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
  folders: string[]
  // what the index already knows: path -> [mtime, size, cover hash or '']
  known: [string, number, number, string][]
  images: FolderImage[]
  coversDir: string
}

export type WorkerMessage =
  | { type: 'progress'; phase: 'walk' | 'read'; done: number; total: number }
  // everything the walk found; `skipped` are folders that could not be read
  | { type: 'listing'; paths: string[]; images: FolderImage[]; skipped: string[] }
  | { type: 'batch'; entries: FileEntry[] }
  // a picture main should resize into the cover cache
  | { type: 'cover'; hash: string; data: Uint8Array }
  | { type: 'done'; failed: number }

// main to worker: a cover was written, so the worker may send more
export type MainMessage = { type: 'cover-done' }
