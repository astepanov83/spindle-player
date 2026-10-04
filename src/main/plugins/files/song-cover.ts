// The cover of a song playing on the radio (ticket 032), from Deezer and
// iTunes. It runs in the library process next to the album lookup and goes
// through the same CoverHttp, so the same limiters, timeouts and image hosts
// hold. Strict like album covers: the station's logo is fine, a wrong cover is not.
import type { SongQuery } from '../types'
import { BusyError, NetError, type CoverHttp } from './cover-http'
import { cleanAlbum, cleanSong } from '../../covers/clean-names'
import { sameArtist, various } from './cover-match'
import { answerError, term } from './cover-sources'

export type SongSource = 'deezer' | 'itunes'
export const songSources: SongSource[] = ['deezer', 'itunes']

// One song a service found, with the cover of the album it is on.
export interface SongCandidate {
  artist: string
  song: string
  image: string
  // 0 the artist's album, 1 a single or EP, 2 a compilation: the album's
  // cover says the most about the song
  rank: number
}

export type SongHttp = Pick<CoverHttp, 'json' | 'image'>

// found: the picture as downloaded. later: a service failed, so nothing is
// kept and the next play of the song looks again.
export type SongOutcome = { data: Uint8Array; source: SongSource } | 'none' | 'later'

// matching songs downloaded per service before going on to the next
const triesPerSource = 3

const withParams = (base: string, params: Record<string, string>): string =>
  `${base}?${new URLSearchParams(params)}`

// A plain search for both: Deezer's artist: and track: filters find nothing
// for songs (see artist-photo.ts).
export function songSearchUrl(source: SongSource, q: SongQuery): string {
  const words = `${term(q.artist)} ${term(q.song)}`
  return source === 'deezer'
    ? withParams('https://api.deezer.com/search/track', { limit: '10', q: words })
    : withParams('https://itunes.apple.com/search', { entity: 'song', limit: '10', term: words })
}

// The setting went off, or a service did: a running song lookup may be about
// to ask a service the user no longer wants asked.
export function stopsSongLookups(
  before: { on: boolean; sources: Record<SongSource, boolean> } | undefined,
  after: { on: boolean; sources: Record<SongSource, boolean> }
): boolean {
  if (!after.on) return true
  return !!before && songSources.some((s) => before.sources[s] && !after.sources[s])
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObject) : [])

function deezer(json: Record<string, unknown>): SongCandidate[] {
  return list(json.data).flatMap((d) => {
    const song = str(d.title)
    const artist = isObject(d.artist) ? str(d.artist.name) : undefined
    const album = isObject(d.album) ? d.album : undefined
    const image = str(album?.cover_xl)
    if (!song || !artist || !image) return []
    // an album with no art gets an empty placeholder picture
    if (album?.md5_image === '' || image.includes('/cover//')) return []
    return [{ artist, song, image, rank: 0 }]
  })
}

function itunes(json: Record<string, unknown>): SongCandidate[] {
  return list(json.results).flatMap((r) => {
    const song = str(r.trackName)
    const artist = str(r.artistName)
    const small = str(r.artworkUrl100)
    if (!song || !artist || !small) return []
    const by = str(r.collectionArtistName)
    const rank =
      by && various.has(cleanAlbum(by))
        ? 2
        : / - (Single|EP)$/.test(str(r.collectionName) ?? '')
          ? 1
          : 0
    // the same picture comes in any size by its name
    const image = small.replace(/\/100x100bb\./, '/1200x1200bb.')
    return [{ artist, song, image, rank }]
  })
}

export function parseSongAnswer(source: SongSource, json: unknown): SongCandidate[] {
  if (!isObject(json)) return []
  return source === 'deezer' ? deezer(json) : itunes(json)
}

// The songs that are ours, best first: same song after cleanup ("(Live 2003)"
// is another recording, often with a live album's cover), same artist.
export function pickSongs(q: SongQuery, found: SongCandidate[]): SongCandidate[] {
  const song = cleanSong(q.song)
  if (!song) return []
  return found
    .filter((c) => cleanSong(c.song) === song && sameArtist(q.artist, c.artist))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.rank - b.c.rank || a.i - b.i)
    .map((x) => x.c)
}

// Deezer, then iTunes, as far as the user has them on. The first match whose
// picture downloads wins. Throws only the abort (a new title, the setting off).
export async function findSongCover(
  http: SongHttp,
  sources: Record<SongSource, boolean>,
  q: SongQuery,
  signal: AbortSignal
): Promise<SongOutcome> {
  signal.throwIfAborted()
  let answered = 0
  let failed = 0
  const step = async <T>(f: () => Promise<T>): Promise<T | undefined> => {
    try {
      const r = await f()
      answered++
      return r
    } catch (e) {
      if (signal.aborted || !(e instanceof NetError || e instanceof BusyError)) throw e
      failed++
      return undefined
    }
  }
  for (const source of songSources) {
    if (!sources[source]) continue
    const json = await step(() => http.json(songSearchUrl(source, q), source, signal))
    if (json === undefined) continue
    if (answerError(source, json)) {
      failed++
      continue
    }
    for (const c of pickSongs(q, parseSongAnswer(source, json)).slice(0, triesPerSource)) {
      const data = await step(() => http.image(c.image, source, signal))
      if (data) return { data, source }
    }
  }
  return failed || !answered ? 'later' : 'none'
}
