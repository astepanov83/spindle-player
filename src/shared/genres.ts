// Genres from the tags (ticket 122): one tag value can hold several genres,
// and the same genre is written many ways. Plain functions, shared so the
// page can use the same rules.

// ID3v1's genre numbers with Winamp's additions, as music-metadata has them.
// music-metadata turns ID3's "(17)" into "Rock" itself; Vorbis comments and
// ffprobe give the number as written.
export const id3Genres: readonly string[] = [
  'Blues',
  'Classic Rock',
  'Country',
  'Dance',
  'Disco',
  'Funk',
  'Grunge',
  'Hip-Hop',
  'Jazz',
  'Metal',
  'New Age',
  'Oldies',
  'Other',
  'Pop',
  'R&B',
  'Rap',
  'Reggae',
  'Rock',
  'Techno',
  'Industrial',
  'Alternative',
  'Ska',
  'Death Metal',
  'Pranks',
  'Soundtrack',
  'Euro-Techno',
  'Ambient',
  'Trip-Hop',
  'Vocal',
  'Jazz+Funk',
  'Fusion',
  'Trance',
  'Classical',
  'Instrumental',
  'Acid',
  'House',
  'Game',
  'Sound Clip',
  'Gospel',
  'Noise',
  'Alt. Rock',
  'Bass',
  'Soul',
  'Punk',
  'Space',
  'Meditative',
  'Instrumental Pop',
  'Instrumental Rock',
  'Ethnic',
  'Gothic',
  'Darkwave',
  'Techno-Industrial',
  'Electronic',
  'Pop-Folk',
  'Eurodance',
  'Dream',
  'Southern Rock',
  'Comedy',
  'Cult',
  'Gangsta Rap',
  'Top 40',
  'Christian Rap',
  'Pop/Funk',
  'Jungle',
  'Native American',
  'Cabaret',
  'New Wave',
  'Psychedelic',
  'Rave',
  'Showtunes',
  'Trailer',
  'Lo-Fi',
  'Tribal',
  'Acid Punk',
  'Acid Jazz',
  'Polka',
  'Retro',
  'Musical',
  'Rock & Roll',
  'Hard Rock',
  'Folk',
  'Folk/Rock',
  'National Folk',
  'Swing',
  'Fast-Fusion',
  'Bebob',
  'Latin',
  'Revival',
  'Celtic',
  'Bluegrass',
  'Avantgarde',
  'Gothic Rock',
  'Progressive Rock',
  'Psychedelic Rock',
  'Symphonic Rock',
  'Slow Rock',
  'Big Band',
  'Chorus',
  'Easy Listening',
  'Acoustic',
  'Humour',
  'Speech',
  'Chanson',
  'Opera',
  'Chamber Music',
  'Sonata',
  'Symphony',
  'Booty Bass',
  'Primus',
  'Porn Groove',
  'Satire',
  'Slow Jam',
  'Club',
  'Tango',
  'Samba',
  'Folklore',
  'Ballad',
  'Power Ballad',
  'Rhythmic Soul',
  'Freestyle',
  'Duet',
  'Punk Rock',
  'Drum Solo',
  'A Cappella',
  'Euro-House',
  'Dance Hall',
  'Goa',
  'Drum & Bass',
  'Club-House',
  'Hardcore',
  'Terror',
  'Indie',
  'BritPop',
  'Negerpunk',
  'Polsk Punk',
  'Beat',
  'Christian Gangsta Rap',
  'Heavy Metal',
  'Black Metal',
  'Crossover',
  'Contemporary Christian',
  'Christian Rock',
  'Merengue',
  'Salsa',
  'Thrash Metal',
  'Anime',
  'JPop',
  'Synthpop',
  'Abstract',
  'Art Rock',
  'Baroque',
  'Bhangra',
  'Big Beat',
  'Breakbeat',
  'Chillout',
  'Downtempo',
  'Dub',
  'EBM',
  'Eclectic',
  'Electro',
  'Electroclash',
  'Emo',
  'Experimental',
  'Garage',
  'Global',
  'IDM',
  'Illbient',
  'Industro-Goth',
  'Jam Band',
  'Krautrock',
  'Leftfield',
  'Lounge',
  'Math Rock',
  'New Romantic',
  'Nu-Breakz',
  'Post-Punk',
  'Post-Rock',
  'Psytrance',
  'Shoegaze',
  'Space Rock',
  'Trop Rock',
  'World Music',
  'Neoclassical',
  'Audiobook',
  'Audio Theatre',
  'Neue Deutsche Welle',
  'Podcast',
  'Indie Rock',
  'G-Funk',
  'Dubstep',
  'Garage Rock',
  'Psybient'
]

// More genres in common use, among them names that hold a comma or a slash
// and must stay whole (iTunes' "Hip-Hop/Rap", Discogs' "Folk, World, & Country").
const moreGenres = [
  'Hip-Hop/Rap',
  'Singer/Songwriter',
  'Folk, World, & Country',
  'Stage & Screen',
  "Children's",
  'Non-Music',
  'Brass & Military',
  'Hip Hop',
  'Electronica',
  'Dance/Electronic',
  'R&B/Soul',
  'Christian & Gospel',
  'Spoken Word',
  'Score',
  'Film Score',
  'Video Game',
  'Christmas',
  'Holiday',
  'World',
  'Afrobeat',
  'Afrobeats',
  'Reggaeton',
  'K-Pop',
  'J-Pop',
  'J-Rock',
  'Grime',
  'Trap',
  'Drill',
  'UK Garage',
  'Breaks',
  'Synthwave',
  'Vaporwave',
  'Chillwave',
  'Dream Pop',
  'Indie Pop',
  'Indie Folk',
  'Neo-Soul',
  'Nu Disco',
  'Electropop',
  'Dance-Pop',
  'Alternative Rock',
  'Metalcore',
  'Deathcore',
  'Post-Hardcore',
  'Doom Metal',
  'Stoner Rock',
  'Sludge',
  'Dancehall',
  'Drone',
  'Minimal',
  'Tech House',
  'Deep House',
  'Progressive House',
  'Acid House',
  'Drum and Bass',
  'DnB',
  'D&B',
  'Liquid Funk',
  'Bossa Nova',
  'MPB',
  'Flamenco',
  'Fado',
  'Cumbia',
  'Bachata',
  'Americana',
  'Christian',
  'Worship',
  'Romantic',
  'Orchestral',
  'Piano',
  'EDM',
  'RnB',
  'Avant-Garde',
  'Synth-Pop',
  'Psych',
  'Prog',
  'Progressive',
  'Bebop',
  'Smooth Jazz',
  'Vocal Jazz',
  'Contemporary',
  'Children',
  'Soundtracks'
]

// Case, spaces, dots and dashes don't make another genre: "Hip Hop",
// "hip-hop" and "HipHop" are one. Other signs count ("R&B" is not "RB").
export function genreKey(g: string): string {
  return g.toLowerCase().replace(/[\s._-]+/g, '')
}

const known = new Set([...id3Genres, ...moreGenres].map(genreKey))

// The last word of a name that looks like a genre: "Swedish Death Metal",
// "Neo-Soul", and words made with them ("Metalcore", "Synthwave", "Britpop").
const genreWords =
  /(rock|metal|pop|punk|core|wave|step|gaze|hop|house|soul|funk|folk|jazz|blues|techno|trance|bass|beats?|dub|disco|rap|ska|grunge|tronica?|country|ambient|classical|music|dance)$/

function looksLikeGenre(part: string): boolean {
  if (known.has(genreKey(part))) return true
  const words = part.toLowerCase().split(/[\s-]+/)
  return genreWords.test(words[words.length - 1])
}

// Signs that split a value only when every part looks like a genre, tried in
// this order: "Rock, Metal" and "Rock / Metal" split, "AC/DC" and "Duo
// Cello/Piano" don't. A known name is never split ("Hip-Hop/Rap").
const softSigns = [',', '/', '\\']

// The parts of `v`, or undefined when one of them doesn't look like a genre.
function softSplit(v: string, signs: string[]): string[] | undefined {
  if (known.has(genreKey(v))) return [v]
  const i = signs.findIndex((s) => v.includes(s))
  if (i < 0) return looksLikeGenre(v) ? [v] : undefined
  const out: string[] = []
  for (const raw of v.split(signs[i])) {
    // "Rock, ": a sign left at the end
    const p = raw.trim()
    if (!p) continue
    const got = softSplit(p, signs.slice(i + 1))
    if (!got) return undefined
    out.push(...got)
  }
  return out.length ? out : undefined
}

// ID3's numbers: "17", "(17)", and "(4)Eurodisco" (a number, then a finer
// name). A number with no name is dropped (255 means none).
function fromNumbers(v: string): string[] {
  const whole = /^\(?(\d{1,3})\)?$/.exec(v)
  if (whole) {
    const g = id3Genres[Number(whole[1])]
    return g ? [g] : []
  }
  const out: string[] = []
  let rest = v
  for (let m = /^\((\d{1,3})\)/.exec(rest); m; m = /^\((\d{1,3})\)/.exec(rest)) {
    const g = id3Genres[Number(m[1])]
    if (g) out.push(g)
    rest = rest.slice(m[0].length).trimStart()
  }
  if (rest) out.push(rest)
  return out
}

// What rippers write when they know none.
const noGenre = new Set(['unknown', '<unknown>', 'none', 'genre'])

// One tag value as genres: ";", "|" and a NUL always split (no genre has
// them), the signs above only between genres.
export function splitGenre(value: string): string[] {
  const out: string[] = []
  for (const raw of value.split(/[;|\0]/)) {
    const piece = raw.replace(/\s+/g, ' ').trim()
    if (!piece) continue
    for (const g of fromNumbers(piece)) out.push(...(softSplit(g, softSigns) ?? [g]))
  }
  return out.filter((g) => !noGenre.has(g.toLowerCase()))
}

// A song's genres from its tag values, in tag order, each once (the first
// spelling of it).
export function genresOf(values: readonly string[] | undefined): string[] {
  if (!values?.length) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values)
    for (const g of splitGenre(v)) {
      const k = genreKey(g)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(g)
    }
  return out
}

// The genres of a few songs (an album's), the most common first; a tie goes
// to the one that comes first. Songs are lists of genres with one spelling each.
export function commonGenres(songs: readonly (readonly string[] | undefined)[]): string[] {
  const count = new Map<string, { g: string; n: number; at: number }>()
  for (const list of songs)
    for (const g of list ?? []) {
      const c = count.get(g)
      if (c) c.n++
      else count.set(g, { g, n: 1, at: count.size })
    }
  return [...count.values()].sort((a, b) => b.n - a.n || a.at - b.at).map((c) => c.g)
}

// One spelling per genre across the library: the one most songs use, the
// first one on a tie, so "rock" on one song shows as the "Rock" of the rest.
// `songs` are each song's genres; returns a function from any spelling to the
// chosen one.
export function genreSpellings(songs: Iterable<readonly string[]>): (g: string) => string {
  const counts = new Map<string, Map<string, number>>()
  for (const list of songs)
    for (const g of list) {
      const k = genreKey(g)
      let byName = counts.get(k)
      if (!byName) counts.set(k, (byName = new Map()))
      byName.set(g, (byName.get(g) ?? 0) + 1)
    }
  const chosen = new Map<string, string>()
  for (const [k, byName] of counts) {
    let best = ''
    let bestN = 0
    for (const [g, n] of byName)
      if (n > bestN) {
        best = g
        bestN = n
      }
    chosen.set(k, best)
  }
  return (g) => chosen.get(genreKey(g)) ?? g
}
