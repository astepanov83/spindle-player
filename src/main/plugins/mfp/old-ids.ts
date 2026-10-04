// MFP's ids for the one-time conversion of the files from before item keys
// (main/convert-files.ts).
import { readJsonFile } from '../../json-file'
import { pageEpisode } from './episodes'
import { parseMfp } from './store'

// The ids Music For Programming gives its songs and episodes.
export interface MfpIds {
  tracks: ReadonlySet<string>
  albums: ReadonlySet<string>
}

// From mfp.json, with no network. The MFP plugin makes the ids from it, so
// they come out the same. A missing or broken file knows no ids: all are files'.
export function readMfpIds(path: string): MfpIds {
  const read = readJsonFile(path)
  const episodes = (read.kind === 'ok' ? parseMfp(read.value).episodes : []).map(pageEpisode)
  return {
    tracks: new Set(episodes.flatMap((e) => e.songs.map((s) => s.id))),
    albums: new Set(episodes.map((e) => e.id))
  }
}
