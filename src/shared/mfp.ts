// Music For Programming as main sends it to its page half (tickets 052, 061).
// Main reads the site and keeps mfp.json; the page only shows and plays.
import type { ThemePalettes } from './palette'

// For the line in Settings. Main sends none while MFP is off.
export interface MfpStatus {
  episodes: number
  // when the site was last read, ms; 0 for never
  fetchedAt: number
  // reading the site now
  running: boolean
  // why the last refresh failed; the episodes from before stay
  error?: string
}

// A tracklist row: a stretch of the episode's mp3. The site gives no times,
// so they are spread evenly over the file.
export interface EpisodeSong {
  // the item id; the same as when MFP songs were library tracks
  id: string
  title: string
  artist: string
  // seconds into the mp3; no end: to the end of the file
  start: number
  end?: number
  // seconds
  length: number
}

export interface Episode {
  // its page is "episode/<id>"; the same as when episodes were library albums
  id: string
  // "79: Corticyte"
  title: string
  // the mixer: "Corticyte"
  artist: string
  // 0 when unknown
  year: number
  // the episode's page on the site
  link: string
  // seconds
  length: number
  songs: EpisodeSong[]
}

// The site's picture in the cover cache, shared by every episode. small:
// too small for the stage.
export interface MfpCover {
  hash: string
  palette: ThemePalettes
  small?: boolean
}

// newest first
export interface MfpEpisodes {
  episodes: Episode[]
  cover?: MfpCover
}
