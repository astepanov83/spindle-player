// How search by field (ticket 128) reads the songs of a playlist or smart
// list: what their plugin says, and the core's plays and hearts.
import { infoOf } from '../plugins'
import { loved } from '../stores/loved.svelte'
import { plays } from '../stores/plays.svelte'
import { itemFields } from './views'

export const listFields = itemFields(
  infoOf,
  (k) => plays.of(k),
  (k) => loved.has(k)
)
