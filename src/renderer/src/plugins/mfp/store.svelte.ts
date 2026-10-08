// Music For Programming's data on the page (ticket 061): the episodes and the
// status main sends. Main reads the site; this only holds what came.
import { coverUrls, type Art } from '../../../../shared/library'
import type {
  Episode,
  EpisodeSong,
  MfpEpisodes,
  MfpStatus
} from '../../../../shared/plugins/mfp/mfp'
import { fallbackPalettes } from '../../../../shared/palette'

export interface SongPlace {
  song: EpisodeSong
  episode: Episode
}

class MfpStore {
  // newest first, as main sent them
  episodes: Episode[] = $state.raw([])
  // none while MFP is off, or before main said
  status: MfpStatus | undefined = $state.raw()
  // bumped with every new list; the maps below are plain
  revision = $state(0)
  #songs = new Map<string, SongPlace>()
  #episodes = new Map<string, Episode>()
  #art = new Map<string, Art>()

  load(d: MfpEpisodes): void {
    const cover = d.cover
    const urls = cover && coverUrls(cover.hash)
    this.#songs = new Map()
    this.#episodes = new Map()
    this.#art = new Map()
    for (const e of d.episodes) {
      this.#episodes.set(e.id, e)
      for (const song of e.songs) this.#songs.set(song.id, { song, episode: e })
      // every episode has the site's picture; with none yet, colors and a
      // made picture of its own (ticket 103)
      const made = {
        seed: e.id,
        lengths: e.songs.map((s) => Math.round(s.length)),
        title: e.title,
        artist: e.artist,
        genre: 'Rock',
        // no data to read: flat bars in the sound picture
        loudness: e.songs.map(() => '')
      }
      this.#art.set(
        e.id,
        cover && urls
          ? {
              palette: cover.palette,
              cover: urls.cover,
              coverLarge: cover.small ? '' : urls.coverLarge,
              ...made
            }
          : { palette: fallbackPalettes(e.id), cover: '', coverLarge: '', ...made }
      )
    }
    this.episodes = d.episodes
    this.revision++
  }

  song(id: string): SongPlace | undefined {
    void this.revision
    return this.#songs.get(id)
  }

  episode(id: string): Episode | undefined {
    void this.revision
    return this.#episodes.get(id)
  }

  art(id: string): Art | undefined {
    void this.revision
    return this.#art.get(id)
  }
}

export const mfp = new MfpStore()
