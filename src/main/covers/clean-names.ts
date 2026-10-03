// Names made plain for comparing what a cover service found with ours: album,
// artist and song names, as the album lookup and the radio's song covers both
// match them (ticket 014, 032). Strict on purpose: a wrong cover is worse than none.

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

// "(feat. X)", "[Radio Edit]": the same song, the same cover
const extra = /\b(feat\.?|ft\.?|featuring|edit)\b/i

const live = /\blive\b/i

// The song's name for comparing: album cleanup, and without feat and edit
// brackets. A bracket or a " - " suffix saying "live" stays a word even when
// it says "remaster" too ("Live at Long Beach Arena; 1998 Remaster"), since
// the album cleanup would drop it.
export function cleanSong(s: string): string {
  const marked = s
    .replace(/[([]([^)\]]*)[)\]]/g, (m, inner: string) =>
      live.test(inner) ? ' live ' : extra.test(inner) ? ' ' : m
    )
    .replace(/\s[-–]\s[^-–]*$/, (m) => (live.test(m) ? ' live' : m))
  return cleanAlbum(marked)
}
