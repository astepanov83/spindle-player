// What an MFP song is and how it plays: a stretch of its episode's mp3, which
// main serves at spindle://mfp/<episode id> (src/main/plugins/mfp/plugin.ts).
import type { EpisodeSong } from '../../../../shared/plugins/mfp/mfp'
import { itemKey, type ItemKey } from '../../../../shared/plugins/items'
import type { ItemInfo, ItemState, PageAddress, Playable } from '../types'
import { episodePage } from './nav'
import { mfp } from './store.svelte'

const missing: ItemState = { state: 'missing' }
const loading: ItemState = { state: 'loading' }
const can = { seek: true, pause: true, next: true, previous: true }

export const songKey = (s: EpisodeSong): ItemKey => itemKey('mfp', s.id)

// The episodes are all there once main says MFP is on (its status) and has
// some. Before that, right after MFP is turned on, its songs are on their
// way: the queue must not drop them.
export const complete = (): boolean => !!mfp.status && mfp.episodes.length > 0

// Kept by song object: a new list from main brings new objects.
const answers = new WeakMap<EpisodeSong, ItemState>()

export function songState(id: string): ItemState {
  const place = mfp.song(id)
  if (!place) return complete() ? missing : loading
  let s = answers.get(place.song)
  if (!s) {
    const { song, episode } = place
    const groupTo: PageAddress = { plugin: 'mfp', page: episodePage(episode.id) }
    const titleTo: PageAddress = { ...groupTo, item: song.id }
    const info: ItemInfo = {
      title: song.title,
      subtitle: song.artist,
      group: episode.title,
      no: episode.songs.indexOf(song) + 1,
      length: song.length,
      art: mfp.art(episode.id),
      titleTo,
      groupTo,
      // its artists are not in Artists (ticket 052)
      names: [{ name: song.artist }],
      links: [{ label: 'Go to album', to: titleTo }]
    }
    answers.set(place.song, (s = { state: 'ok', info }))
  }
  return s
}

export function songPlayable(id: string): Playable | undefined {
  const place = mfp.song(id)
  if (!place) return undefined
  const { song, episode } = place
  const url = `spindle://mfp/${episode.id}`
  // the next song of the episode starts where this one ends: the player
  // carries on in the same stream
  const part =
    song.end === undefined
      ? { file: url, start: song.start }
      : { file: url, start: song.start, end: song.end }
  return { url, part, length: song.length, can, codec: 'MPEG 1 Layer 3' }
}
