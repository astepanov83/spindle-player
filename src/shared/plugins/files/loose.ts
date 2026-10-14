// Songs opened from the system that are not in the library (ticket 124): a
// file given to "Open with", on the command line or dropped on the window.
// Their id is the file's path, so a saved queue still finds them after a
// restart; a cue sheet's track is the sheet's path, "#" and the track's
// number. Library ids are 16 hex letters, so the two never mix.
import type { Track } from '../../library'

// A song not in the library, as main sends it to the page. `track.id` is its
// loose id; `file` is the id its audio is served by (spindle://media/<file>).
export interface LooseSong {
  track: Track
  file: string
}

// What came of opening files or loose ids: the page's ids in the order asked
// (library ids for songs in the library), the songs not in it, and the loose
// ids asked for whose files are gone.
export interface OpenedSongs {
  ids: string[]
  loose: LooseSong[]
  gone?: string[]
}

// "/home/me/a.flac", "C:\Music\a.flac", "\\nas\music\a.flac"
const absolute = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/
const cueTrack = /^(.+\.cue)#([1-9]\d{0,2})$/i

export function isLooseId(id: string): boolean {
  return absolute.test(id)
}

export function looseId(path: string, no?: number): string {
  return no === undefined ? path : `${path}#${no}`
}

// The file of a loose id, and for a cue sheet's track its number. A file
// whose own name ends in ".cue#3" is not an audio file, so that can't mix.
export function looseParts(id: string): { path: string; no?: number } | undefined {
  if (!isLooseId(id)) return undefined
  const m = cueTrack.exec(id)
  return m ? { path: m[1], no: Number(m[2]) } : { path: id }
}
