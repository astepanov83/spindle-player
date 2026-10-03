// Music For Programming episodes as the page shows and plays them (tickets
// 052, 061). Each tracklist row is a song: a stretch of the episode's mp3,
// like a CUE track in its disc image. The site gives no times, so the songs
// are spread evenly over the file (as in webmusicfp).
import type { Episode, EpisodeSong } from '../../../shared/mfp'
import { shortHash } from '../../ids'
import type { MfpEpisode } from './site'

// The ids are the ones episodes and songs had as library albums and tracks,
// so queues, playlists and saved links made then still find them.
export const episodeId = (slug: string): string => shortHash(`mfp:${slug}`)
export const songId = (slug: string, i: number): string => shortHash(`mfp:${slug}#${i}`)

export function pageEpisode(ep: MfpEpisode): Episode {
  const d = ep.duration
  // with no length there is nothing to spread the rows over
  const rows = d > 0 && ep.tracks.length ? ep.tracks : [{ artist: '', title: ep.title }]
  const n = rows.length
  const songs = rows.map((row, i): EpisodeSong => {
    const start = n > 1 ? (d * i) / n : 0
    const end = i < n - 1 ? (d * (i + 1)) / n : undefined
    const song: EpisodeSong = {
      id: songId(ep.slug, i),
      title: row.title,
      artist: row.artist || ep.artist,
      start,
      length: (end ?? d) - start
    }
    if (end !== undefined) song.end = end
    return song
  })
  return {
    id: episodeId(ep.slug),
    title: ep.title,
    artist: ep.artist,
    year: ep.date ? Number(ep.date.slice(0, 4)) : 0,
    link: ep.link,
    length: d,
    songs
  }
}
