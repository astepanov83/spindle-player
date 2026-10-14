// Search by field (ticket 128) over the library: a song's album, plays and
// heart come from the stores. Reading plays or hearts only when a query
// asks for them keeps a counted play from running every search again.
import type { Track } from '../../../../shared/library'
import { trackFields } from '../../library/views'
import { loved } from '../../stores/loved.svelte'
import { plays } from '../../stores/plays.svelte'
import { files } from './store.svelte'
import { trackKey } from './tracks'

export const libraryFields = trackFields({
  album: (t: Track) => files.findAlbum(t.albumId),
  played: (t: Track) => plays.of(trackKey(t)),
  loved: (t: Track) => loved.has(trackKey(t))
})
