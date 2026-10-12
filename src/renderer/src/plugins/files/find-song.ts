// A song in the library by artist and title, as a radio station names it
// (ticket 119). Names are compared the way the song cover lookup compares
// them (shared/clean-names.ts): case, accents, "(Remastered)" and "feat."
// don't count, a live version does.
import { cleanArtist, cleanSong } from '../../../../shared/clean-names'
import type { Album, Track } from '../../../../shared/library'

const keyOf = (artist: string, title: string): string => {
  const a = cleanArtist(artist)
  const t = cleanSong(title)
  return a && t ? `${a}\n${t}` : ''
}

// A radio artist "A feat. B" is also looked for as "A".
const feat = /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i

// Each song under every name it is shown or tagged with: the name
// artists.json made of the tag, each artist of a split credit, and the tag.
// The first song in library order wins.
export function songIndex(albums: Album[], track: (id: string) => Track): Map<string, string> {
  const out = new Map<string, string>()
  for (const al of albums)
    for (const id of al.trackIds) {
      const t = track(id)
      for (const name of new Set([t.artist, ...(t.artists ?? []), t.artistTag ?? ''])) {
        const k = name ? keyOf(name, t.title) : ''
        if (k && !out.has(k)) out.set(k, t.id)
      }
    }
  return out
}

export function findIn(
  index: Map<string, string>,
  artist: string,
  title: string
): string | undefined {
  for (const name of new Set([artist, artist.replace(feat, '')])) {
    const id = index.get(keyOf(name, title))
    if (id !== undefined) return id
  }
  return undefined
}
