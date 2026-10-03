// Music For Programming's page half. Its episodes are library albums until
// ticket 061, so it reads the library store.
import { library } from '../../stores/library.svelte'
import { canOpenPage, openPage, trackPlayable, trackState } from '../files/tracks'
import type { PageHalf } from '../types'

// The episodes are all there once main says MFP is on (its status) and the
// library has them. Before that, right after MFP is turned on, its songs are
// on their way: the queue must not drop them.
function complete(): boolean {
  return !!library.status.mfp && library.mfpAlbums.length > 0
}

export const mfpHalf: PageHalf = {
  info: (id) => trackState('mfp', id, complete),
  play: (id) => trackPlayable('mfp', id),
  canOpen: canOpenPage,
  open: openPage,
  version: () => library.revision * 2 + (complete() ? 1 : 0)
}
