// Music For Programming's page half. Its episodes are library albums until
// ticket 061, so it reads the library store.
import { searchSongs } from '../../library/views'
import { library } from '../../stores/library.svelte'
import { trackKey, trackPlayable, trackState } from '../files/tracks'
import type { PageHalf } from '../types'
import { canOpenMfp, keepMfp, mfpPath, mfpTabOf, mfpTabs } from './nav'

// The episodes are all there once main says MFP is on (its status) and the
// library has them. Before that, right after MFP is turned on, its songs are
// on their way: the queue must not drop them.
function complete(): boolean {
  return !!library.status.mfp && library.mfpAlbums.length > 0
}

export const mfpHalf: PageHalf = {
  info: (id) => trackState('mfp', id, complete),
  play: (id) => trackPlayable('mfp', id),
  tabs: mfpTabs,
  tabOf: mfpTabOf,
  canOpen: canOpenMfp,
  keep: keepMfp,
  path: mfpPath,
  // its old view until blocks draw it (ticket 061)
  page: () => [{ kind: 'view', view: 'mfp' }],
  // songs in the mixes, shown in the library's search results (ticket 052)
  search: (query) => [
    {
      id: 'mixes',
      title: 'In MFP mixes',
      songs: searchSongs(library.mfpAlbums, (id) => library.track(id), query).map(trackKey)
    }
  ],
  version: () => library.revision * 2 + (complete() ? 1 : 0)
}
