// Name cleanup and the rules for taking a cover found online (ticket 014).
// Strict on purpose: an album with no cover is fine, a wrong cover is not.

// An album with no picture of its own, to look up.
export interface CoverQuery {
  albumId: string
  // the album's artist as shown ("Various Artists" for a compilation)
  artist: string
  // the album tag
  album: string
  // 0 when unknown
  year: number
  tracks: number
  compilation: boolean
  // "Unknown artist": only the MusicBrainz id lookup
  noArtist: boolean
  // searchKey(artist, album): a stored result counts only for the same names
  key: string
  mbReleaseGroup?: string
  mbRelease?: string
}

export type ReleaseKind = 'album' | 'single' | 'ep' | 'other'

// One album a service found.
export interface Candidate {
  artist: string
  album: string
  year?: number
  tracks?: number
  // unknown for services that don't say
  kind?: ReleaseKind
  image: string
}

// A single or EP shares its title with the album, but not its cover.
const minAlbumTracks = 5

const edition =
  /\b(deluxe|remaster(ed)?|edition|bonus|expanded|anniversary|mono|stereo|mix|version|reissue)\b/i

// Lowercase, no accents, "&" as "and", anything but letters and digits as one space.
function fold(s: string): string {
  return (
    s
      .normalize('NFKD')
      // accents on Latin, Greek and Cyrillic letters only: in Indic scripts and
      // kana the marks are part of the word
      .replace(/([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{Mn}+/gu, '$1')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  )
}

// The album's name without edition words and disc numbers, as written.
export function stripEdition(s: string): string {
  return (
    s
      // brackets holding edition words: "(Remastered 2009)", "[Deluxe Edition]"
      .replace(/[([]([^)\]]*)[)\]]/g, (m, inner: string) => (edition.test(inner) ? ' ' : m))
      // " - Remastered 2009" at the end
      .replace(/\s[-–]\s[^-–]*$/, (m) => (edition.test(m) ? '' : m))
      // "CD1", "(Disc 2)" at the end
      .replace(/[\s([-]*\b(cd|dis[ck])\s*\d+[)\]]?\s*$/i, '')
      .trim()
  )
}

export function cleanAlbum(s: string): string {
  return fold(stripEdition(s))
}

export function cleanArtist(s: string): string {
  return fold(s).replace(/^the /, '')
}

export function searchKey(artist: string, album: string): string {
  return cleanArtist(artist) + '\0' + cleanAlbum(album)
}

// compilation credits; artist photos skip them too
export const various: ReadonlySet<string> = new Set(['various artists', 'various', 'va'])

// The names in a joint credit: "Jay-Z & Kanye West", "Drake feat. Rihanna".
const joiner = /\s*(?:[,&/+;]|\s(?:and|feat\.?|ft\.?|featuring|with|x|vs\.?)\s)\s*/i

// Shorter names match too much: "DC" from "AC/DC".
const minCreditLength = 4

function credits(s: string): string[] {
  return s
    .split(joiner)
    .map(cleanArtist)
    .filter((c) => c.length >= minCreditLength)
}

function artistMatches(q: CoverQuery, found: string): boolean {
  const f = cleanArtist(found)
  if (q.compilation) return various.has(f)
  const a = cleanArtist(q.artist)
  if (!a || !f) return false
  if (a === f) return true
  // one is a joint credit holding the other; a name that only contains the
  // other ("Кино Фильм" for "Кино") is another artist
  return credits(found).includes(a) || credits(q.artist).includes(f)
}

// Many compilations share a title ("Love Songs"), so one is taken only when
// its track count or year is known on both sides, and each known one is at
// most 1 apart.
function compilationAgrees(q: CoverQuery, c: Candidate): boolean {
  const close = (a: number | undefined, b: number | undefined): boolean | undefined =>
    a && b ? Math.abs(a - b) <= 1 : undefined
  const tracks = close(q.tracks, c.tracks)
  const year = close(q.year, c.year)
  if (tracks === undefined && year === undefined) return false
  return tracks !== false && year !== false
}

// Years or track counts apart; unknown counts as 1 apart.
const gap = (a: number | undefined, b: number | undefined): number => (a && b ? Math.abs(a - b) : 1)

// The results that match, best first: within 2 years first, then albums
// before singles and EPs, then the closest year, then the closest track count.
export function pickCandidates(q: CoverQuery, found: Candidate[]): Candidate[] {
  const album = cleanAlbum(q.album)
  if (!album) return []
  const short = (c: Candidate): boolean => c.kind === 'single' || c.kind === 'ep'
  return found
    .filter((c) => cleanAlbum(c.album) === album && artistMatches(q, c.artist))
    .filter((c) => !(short(c) && q.tracks >= minAlbumTracks))
    .filter((c) => !q.compilation || compilationAgrees(q, c))
    .map((c) => ({ c, y: gap(q.year, c.year), t: gap(q.tracks, c.tracks), k: Number(short(c)) }))
    .sort((a, b) => Number(a.y > 2) - Number(b.y > 2) || a.k - b.k || a.y - b.y || a.t - b.t)
    .map((x) => x.c)
}
