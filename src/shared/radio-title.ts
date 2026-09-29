// A radio stream's title and its parts. Shared: the page shows them, and main
// looks the song's cover up by them (ticket 032).

const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'"
}

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, k: string) => entities[k])
}

export interface RadioTitleParts {
  raw: string
  // "Artist - Song", without the DJ and show parts
  track: string
  artist: string
  song: string
  dj: string
  show: string
}

// From webmusicmo lib/nowplaying.js. Titles look like
// "Artist - Song * DJ OnAir * Show name * " (Metal Only), or only
// "Artist - Song", or have no dash at all (jingles, ads).
export function parseTitle(raw: string): RadioTitleParts {
  const text = decodeEntities(raw || '').trim()
  const parts = text
    .split('*')
    .map((p) => p.trim())
    .filter(Boolean)
  const track = parts[0] || ''
  let dj = ''
  let show = ''
  for (const part of parts.slice(1)) {
    const onAir = /^(.*?)\s+OnAir$/i.exec(part)
    if (onAir && !dj) dj = onAir[1].trim()
    else if (!show) show = part
  }
  let artist = ''
  let song = track
  const dash = track.indexOf(' - ')
  if (dash > 0) {
    artist = track.slice(0, dash).trim()
    song = track.slice(dash + 3).trim()
  }
  return { raw: text, track, artist, song, dj, show }
}

export interface SongQuery {
  artist: string
  song: string
}

// Letters and digits only, lowercase: "METAL-ONLY" is "metalonly".
const bare = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const onAir = /\bOnAir$/i

// The names a song cover is looked up by, or undefined for a title that is no
// song: no " - " (jingles, ads, shows), a DJ's "OnAir" part, or the station's
// own name as the artist ("Metal Only - Jingle"). Only the "Artist - Song"
// part is sent; the DJ and the show are not.
export function songQuery(raw: string, station = ''): SongQuery | undefined {
  const { artist, song } = parseTitle(raw)
  if (!artist || !song) return undefined
  if (onAir.test(artist) || onAir.test(song)) return undefined
  if (station && bare(artist) === bare(station)) return undefined
  return { artist, song }
}
