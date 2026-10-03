// Music For Programming episodes as library albums and tracks (ticket 052).
// Each episode is one album; each tracklist row is a track that points into
// the episode's mp3, like a CUE track into its disc image. The site gives no
// times, so the songs are spread evenly over the file (as in webmusicfp).
import type { Album, Art, Track } from '../../shared/library'
import { shortHash } from './ids'
import type { MfpEpisode } from './mfp'

// What main needs to serve an episode's mp3 by its file id.
export interface OnlineFile {
  url: string
  duration: number
}

export interface MfpLibrary {
  albums: Album[]
  tracks: Track[]
  // file id -> the episode's mp3
  urls: Map<string, OnlineFile>
}

// `art` gives an album its cover and colors by album id.
export function mfpLibrary(episodes: MfpEpisode[], art: (albumId: string) => Art): MfpLibrary {
  const albums: Album[] = []
  const tracks: Track[] = []
  const urls = new Map<string, OnlineFile>()
  for (const ep of episodes) {
    const albumId = shortHash(`mfp:${ep.slug}`)
    const file = shortHash(`mfp:${ep.url}`)
    urls.set(file, { url: ep.url, duration: ep.duration })
    const d = ep.duration
    // with no length there is nothing to spread the rows over
    const rows = d > 0 && ep.tracks.length ? ep.tracks : [{ artist: '', title: ep.title }]
    const n = rows.length
    const own = rows.map((row, i): Track => {
      const start = n > 1 ? (d * i) / n : 0
      const end = i < n - 1 ? (d * (i + 1)) / n : undefined
      return {
        id: shortHash(`mfp:${ep.slug}#${i}`),
        title: row.title,
        duration: (end ?? d) - start,
        albumId,
        artist: row.artist || ep.artist,
        album: ep.title,
        no: i + 1,
        disc: 1,
        codec: 'MPEG 1 Layer 3',
        part: end === undefined ? { file, start } : { file, start, end },
        folder: -1,
        online: 'mfp'
      }
    })
    tracks.push(...own)
    albums.push({
      id: albumId,
      title: ep.title,
      artist: ep.artist,
      year: ep.date ? Number(ep.date.slice(0, 4)) : 0,
      ...art(albumId),
      trackIds: own.map((t) => t.id),
      online: 'mfp',
      link: ep.link
    })
  }
  return { albums, tracks, urls }
}
