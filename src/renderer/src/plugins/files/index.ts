// The music files plugin's page half. Thin over the library store for now;
// the store moves here in ticket 063.
import { library } from '../../stores/library.svelte'
import type { PageHalf } from '../types'
import { canOpenPage, openPage, trackPlayable, trackState } from './tracks'

// before the first library a song is on its way, not gone
const complete = (): boolean => library.loaded

export const filesHalf: PageHalf = {
  info: (id) => trackState('files', id, complete),
  play: (id) => trackPlayable('files', id),
  canOpen: canOpenPage,
  open: openPage,
  version: () => library.revision
}
