// Music For Programming's page half. Its episodes are library albums until
// ticket 061, so it reads the library store.
import { library } from '../../stores/library.svelte'
import { trackPlayable, trackState } from '../files/tracks'
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
  version: () => library.revision * 2 + (complete() ? 1 : 0)
}
