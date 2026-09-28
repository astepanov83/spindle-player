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
  // set when the track is a stretch of a bigger file (a CUE sheet's disc image)
  part?: TrackPart
  // the song's own picture, set only when it differs from its album's
  // (compilations, singles folders); else the album's is shown
  art?: Art
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

// Where a track lies in its file, in seconds. `file` is the id the page loads
// (spindle://media/<file>), the same for every track of one image.
export interface TrackPart {
  file: string
  start: number
  // none for the last track: it runs to the end of the file
  end?: number
}

export interface Album extends Art {
  id: string
  title: string
  artist: string
  // 0 when unknown
  year: number
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
  // Main gave up on the library process for this run. not-loaded: it never
  // gave a library. stopped: it did, then stopped; songs no longer play.
  unavailable?: 'not-loaded' | 'stopped'
  // the last scan ended with an error (it is logged); the next scan clears it
  scanFailed?: boolean
  // settings.json could not be read, so the folders can't be changed or scanned this run
  settingsUnreadable?: boolean
}
