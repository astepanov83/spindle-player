// Where each service is asked for a cover, and what its answer means (ticket 014).
import type { CoverSource } from '../../../shared/settings'
import { stripEdition, type Candidate, type CoverQuery, type ReleaseKind } from './cover-match'

export const caaGroupUrl = (id: string): string =>
  `https://coverartarchive.org/release-group/${id}/front-1200`
export const caaReleaseUrl = (id: string): string =>
  `https://coverartarchive.org/release/${id}/front-1200`

// Names go as written, so the services know the words (cleanup is for
// comparing only: it drops kana voicing marks). Quotes and backslashes are
// query syntax for Deezer and MusicBrainz.
export const term = (s: string): string => s.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim()

const withParams = (base: string, params: Record<string, string>): string =>
  `${base}?${new URLSearchParams(params)}`

export function searchUrl(source: CoverSource, q: CoverQuery): string {
  const album = term(stripEdition(q.album))
  // Deezer and iTunes list compilations under many names, so the album alone
  const artist = q.compilation ? '' : term(q.artist)
  switch (source) {
    case 'deezer':
      return withParams('https://api.deezer.com/search/album', {
        limit: '10',
        q: (artist ? `artist:"${artist}" ` : '') + `album:"${album}"`
      })
    case 'itunes':
      return withParams('https://itunes.apple.com/search', {
        entity: 'album',
        limit: '10',
        term: [artist, album].filter(Boolean).join(' ')
      })
    case 'musicbrainz':
      return withParams('https://musicbrainz.org/ws/2/release-group', {
        fmt: 'json',
        limit: '10',
        query: `releasegroup:"${album}"` + (artist ? ` AND artist:"${artist}"` : '')
      })
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined
// "1969-09-26T07:00:00Z", "1969-09-26" or "1969"
const yearOf = (v: unknown): number | undefined => num(Number(str(v)?.slice(0, 4)))
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObject) : [])

// Deezer's record_type and MusicBrainz's primary-type, in any case.
function kindOf(v: unknown): ReleaseKind | undefined {
  const t = str(v)?.toLowerCase()
  if (!t) return undefined
  return t === 'album' || t === 'single' || t === 'ep' ? t : 'other'
}

function deezer(json: Record<string, unknown>): Candidate[] {
  return list(json.data).flatMap((d) => {
    const album = str(d.title)
    const artist = isObject(d.artist) ? str(d.artist.name) : undefined
    const image = str(d.cover_xl)
    if (!album || !artist || !image) return []
    // an album with no art gets an empty placeholder picture
    if (d.md5_image === '' || image.includes('/cover//')) return []
    return [{ album, artist, image, tracks: num(d.nb_tracks), kind: kindOf(d.record_type) }]
  })
}

function itunes(json: Record<string, unknown>): Candidate[] {
  return list(json.results).flatMap((r) => {
    const name = str(r.collectionName)
    const artist = str(r.artistName)
    const small = str(r.artworkUrl100)
    if (!name || !artist || !small) return []
    // iTunes marks singles and EPs only in the name: "Thriller - Single"
    const short = / - (Single|EP)$/.exec(name)
    const album = short ? name.slice(0, short.index) : name
    const kind: ReleaseKind = short ? (short[1] === 'EP' ? 'ep' : 'single') : 'album'
    // the same picture comes in any size by its name
    const image = small.replace(/\/100x100bb\./, '/1200x1200bb.')
    return [{ album, artist, image, kind, tracks: num(r.trackCount), year: yearOf(r.releaseDate) }]
  })
}

function musicbrainz(json: Record<string, unknown>): Candidate[] {
  return list(json['release-groups']).flatMap((g) => {
    const id = str(g.id)
    const album = str(g.title)
    const artist = list(g['artist-credit'])
      .map((a) => (str(a.name) ?? '') + (str(a.joinphrase) ?? ''))
      .join('')
    if (!id || !album || !artist) return []
    const year = yearOf(g['first-release-date'])
    return [{ album, artist, image: caaGroupUrl(id), year, kind: kindOf(g['primary-type']) }]
  })
}

// An answer that is an error, not a list: Deezer reports a quota or a
// broken query in a 200 answer.
export function answerError(source: CoverSource, json: unknown): boolean {
  return source === 'deezer' && isObject(json) && json.error !== undefined
}

export function parseAnswer(source: CoverSource, json: unknown): Candidate[] {
  if (!isObject(json)) return []
  if (source === 'deezer') return deezer(json)
  if (source === 'itunes') return itunes(json)
  return musicbrainz(json)
}
