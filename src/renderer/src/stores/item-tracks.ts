// Until ticket 056, the page asks the library about the items of the queue
// and playlists: files and MFP items are both library tracks, by the id after
// the ":". 056 asks each item's plugin instead and removes this file.
import { itemKey, type ItemKey } from '../../../shared/plugins/items'
import { library } from './library.svelte'

// Keys in the stores were checked when they came in, so no full split: this
// runs on every row of a 50k queue.
export function trackIdOf(key: string): string {
  return key.slice(key.indexOf(':') + 1)
}

export function trackIdsOf(keys: string[]): string[] {
  return keys.map(trackIdOf)
}

// A song the library doesn't have (yet) counts as a file's.
export function keyOfTrack(id: string): ItemKey {
  const mfp = library.has(id) && library.track(id).online === 'mfp'
  return itemKey(mfp ? 'mfp' : 'files', id)
}

export function keysOfTracks(ids: string[]): ItemKey[] {
  return ids.map(keyOfTrack)
}

// The library's answer for an item; prune and restore keep what it has.
export function hasItem(key: string): boolean {
  return library.has(trackIdOf(key))
}
