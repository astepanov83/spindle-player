// Artist photos from Deezer for the Artists view (ticket 021). Strict like
// covers: a missing photo is fine, a wrong one is not. Deezer lists many
// artists under one name ("Queen" five times, with pictures), so a found
// artist is taken only when one of their albums or songs has a title the
// library has too.
import { allowedImageHost } from './cover-http'
import { cleanAlbum, cleanArtist, stripEdition } from './cover-match'
import { term } from './cover-sources'

// A title of the artist's to check a found artist by.
export interface ArtistCheck {
  kind: 'album' | 'song'
  title: string
}

// An artist to find a photo for.
export interface ArtistQuery {
  // artistKey(name): the page's key for the artist, and the stored result's
  id: string
  // as shown
  name: string
  // cleanArtist(name): a stored result counts only for the same name
  key: string
  // their albums first, then their songs on other albums; a few at most
  checks: ArtistCheck[]
}

// One artist Deezer found under the name.
export interface ArtistCandidate {
  id: number
  image: string
}

// titles tried per artist, each a request
export const checksPerArtist = 3

const noPhoto = new Set(['various artists', 'various', 'unknown artist'])

// Compilations, unknown artists and names with no letters match anyone.
export function lookUpArtist(name: string): boolean {
  return /\p{L}/u.test(name) && !noPhoto.has(cleanArtist(name))
}

const withParams = (base: string, params: Record<string, string>): string =>
  `${base}?${new URLSearchParams(params)}`

export function artistSearchUrl(name: string): string {
  return withParams('https://api.deezer.com/search/artist', { limit: '25', q: term(name) })
}

// A plain search: Deezer's artist: and track: filters find nothing for
// songs, and miss albums the plain search finds ("Daft Punk Discovery").
export function checkUrl(name: string, c: ArtistCheck): string {
  const kind = c.kind === 'album' ? 'album' : 'track'
  return withParams(`https://api.deezer.com/search/${kind}`, {
    limit: '25',
    q: `${term(name)} ${term(stripEdition(c.title))}`
  })
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (v: unknown): Record<string, unknown>[] =>
  isObject(v) && Array.isArray(v.data) ? v.data.filter(isObject) : []
const idOf = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined

// The artists in a search answer with the same name after cleanup (no
// joint-credit loosening: "A" never gets the photo of "A & B") and a real
// picture. An artist with none has an empty one ("/images/artist//1000x...").
export function artistCandidates(json: unknown, name: string): ArtistCandidate[] {
  const want = cleanArtist(name)
  if (!want) return []
  const out: ArtistCandidate[] = []
  for (const d of list(json)) {
    const id = idOf(d.id)
    const image = d.picture_xl
    if (!id || typeof image !== 'string' || typeof d.name !== 'string') continue
    if (d.md5_image === '' || image.includes('/artist//') || !allowedImageHost(image)) continue
    if (cleanArtist(d.name) !== want || out.some((c) => c.id === id)) continue
    out.push({ id, image })
  }
  return out
}

// The candidate that has an album or song with the checked title in the answer.
export function checkedArtist(
  json: unknown,
  c: ArtistCheck,
  candidates: ArtistCandidate[]
): ArtistCandidate | undefined {
  const want = cleanAlbum(c.title)
  if (!want) return undefined
  for (const d of list(json)) {
    const title = c.kind === 'song' && typeof d.title_short === 'string' ? d.title_short : d.title
    if (typeof title !== 'string' || cleanAlbum(title) !== want) continue
    const id = isObject(d.artist) ? idOf(d.artist.id) : undefined
    const found = candidates.find((x) => x.id === id)
    if (found) return found
  }
  return undefined
}
