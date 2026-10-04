// For the files from before item keys (main/convert-files.ts): MFP knows its
// songs and episodes by mfp.json, an old queue that played radio names its
// station, and every other id is Music files'. A list of the plugins, like list.ts.
import { join } from 'path'
import { itemKey } from '../../shared/plugins/items'
import { isStationId } from '../../shared/plugins/radio/stations'
import { queueLink } from '../../shared/saved-queue'
import type { OldIds } from '../convert-files'
import { readMfpIds, type MfpIds } from './mfp/old-ids'

export function oldIdsFrom(mfp: MfpIds): OldIds {
  return {
    track: (id) => itemKey(mfp.tracks.has(id) ? 'mfp' : 'files', id),
    album: (id) => queueLink(mfp.albums.has(id) ? 'episode' : 'album', id),
    live: (raw) =>
      raw.kind === 'radio' && isStationId(raw.station) ? itemKey('radio', raw.station) : undefined
  }
}

// From mfp.json in the folder of the old files.
export const oldIds = (dir: string): OldIds => oldIdsFrom(readMfpIds(join(dir, 'mfp.json')))
