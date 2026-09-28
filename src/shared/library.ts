// Library types, as the page sees them. Main builds them from the index (ticket 006).
import type { ThemePalettes } from './palette'

export interface Track {
  id: string
  title: string
  // seconds
  duration: number
  albumId: string
  artist: string
  album: string
  // track number, 1-based; 0 when unknown
  no: number
  // disc number, 1-based
  disc: number
  // e.g. "MPEG 1 Layer 3", "FLAC", "ALAC"; empty when unknown
  codec: string
}

export interface Album {
  id: string
  title: string
  artist: string
  // 0 when unknown
  year: number
  // [--c1, --c2, --c3] (main, accent, dark) for each theme, from the cover (ticket 009)
  palette: ThemePalettes
  // small cover URL for grids and lists, or '' when there is none
  cover: string
  // big cover URL for the stage, or ''
  coverLarge: string
  trackIds: string[]
}

// What main sends the page. Albums and tracks are in library order.
export interface LibraryData {
  albums: Album[]
  tracks: Track[]
}

export type ScanPhase = 'idle' | 'walk' | 'read'

export interface ScanStatus {
  folders: string[]
  phase: ScanPhase
  // files found so far (walk) or files read so far (read)
  done: number
  // files to read; 0 while walking
  total: number
  tracks: number
  albums: number
  // files whose tags could not be read in the last scan
  failed: number
  // folders that could not be read in the last scan, e.g. an unplugged drive
  missing: string[]
  // main gave up on the library worker: no library this run
  unavailable?: boolean
}
