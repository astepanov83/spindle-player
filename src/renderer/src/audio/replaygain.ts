// Evening out loudness with ReplayGain (ticket 090): the level a song plays
// at, from its tags and the setting. The engine sets it on the song's own
// gain node, before the analyser, so the visualizer sees the evened level.
import type { ReplayGain } from '../../../shared/library'
import type { Loudness } from '../../../shared/settings'

// The song's level as a factor (1 is as the file is). `use` 'song' takes its
// track gain, 'album' its album gain; each falls back to the other when the
// file has only one. The peak keeps a boost from clipping: the song's loudest
// sample stays at or under full scale. A song with no tags plays as it is.
export function gainFactor(g: ReplayGain | undefined, use: Loudness): number {
  if (!g || use === 'off') return 1
  const album = use === 'album' ? g.album !== undefined : g.track === undefined
  const db = album ? g.album : g.track
  if (db === undefined) return 1
  // the album's peak is at least the song's, so it is a safe stand-in
  const peak = album ? (g.albumPeak ?? g.trackPeak) : (g.trackPeak ?? g.albumPeak)
  const f = 10 ** (db / 20)
  return peak ? Math.min(f, 1 / peak) : f
}

// By album uses album gain only while the album plays in order: shuffle off,
// and the song before or after it in the queue is from the same album.
// Album gain keeps an album's quiet songs quiet next to its loud ones, which
// is right only among its own songs. Anywhere else (shuffle, a playlist that
// mixes albums) the song's own gain evens it out against its neighbors.
export function gainUse<K>(
  setting: Loudness,
  q: { items: readonly K[]; index: number },
  shuffle: boolean,
  albumOf: (key: K) => string | undefined
): Loudness {
  if (setting !== 'album') return setting
  if (shuffle) return 'song'
  const key = q.items[q.index]
  const album = key === undefined ? undefined : albumOf(key)
  if (album === undefined) return 'song'
  const near = [q.items[q.index - 1], q.items[q.index + 1]]
  return near.some((k) => k !== undefined && albumOf(k) === album) ? 'album' : 'song'
}
