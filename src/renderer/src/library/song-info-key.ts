// The song of the row with focus, for the I key (ticket 127): song rows say
// theirs in data-song-key.
import { isItemKey, type ItemKey } from '../../../shared/plugins/items'

export function songKeyOf(el: Element | null): ItemKey | undefined {
  const key = el?.closest<HTMLElement>('[data-song-key]')?.dataset.songKey
  return isItemKey(key) ? key : undefined
}
