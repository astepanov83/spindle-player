// The album page's rows, label and Play button. No DOM.
import { isVarious, type Album, type Track } from '../../../shared/library'
import type { QueueLink } from '../../../shared/saved-queue'

// A "Disc 2" label, or a song with its place in the album (`at`, for
// playAlbum) and the number shown (0: none).
export type AlbumLine = { disc: number } | { track: Track; at: number; no: number }

// Songs come sorted by disc and number (main's group.ts). Disc rows only when
// there is more than one disc. On a disc with no numbers at all, a song shows
// its place. On one where only some have numbers, its place could repeat a
// tagged number, so it shows none.
export function albumLines(tracks: Track[]): AlbumLine[] {
  const discs = new Set(tracks.map((t) => t.disc))
  const numbered = new Set(tracks.filter((t) => t.no).map((t) => t.disc))
  const lines: AlbumLine[] = []
  let disc: number | undefined
  let onDisc = 0
  tracks.forEach((t, at) => {
    if (t.disc !== disc) {
      disc = t.disc
      onDisc = 0
      if (discs.size > 1) lines.push({ disc })
    }
    onDisc++
    lines.push({ track: t, at, no: t.no || (numbered.has(t.disc) ? 0 : onDisc) })
  })
  return lines
}

// "Album · 2021", or "Compilation" for a various artists credit. The tag
// counts, so a renamed credit still says Compilation.
export function albumLabel(al: Pick<Album, 'artist' | 'artistTag' | 'year'>): string {
  const kind = isVarious(al.artistTag ?? al.artist) ? 'Compilation' : 'Album'
  return al.year ? `${kind} · ${al.year}` : kind
}

// What the queue says, for the album page's Play button.
export interface QueueSide {
  link: QueueLink | undefined
  // the album of the queue's current song
  currentAlbum: string | undefined
  // the queue ran out: its last song waits at 0:00
  ended: boolean
  // the queue has the player, not radio
  queuePlays: boolean
  sounding: boolean
}

// What the page's Play button does. While the queue came from this album
// (its link), one of its songs is on and the queue has not run out, it pauses
// and resumes. Else it plays the album from the start: after the end, Play
// would only replay the last song. Add to queue keeps the old link, so the
// song on must be from this album too.
export function albumButton(albumId: string, q: QueueSide): 'play' | 'pause' | 'resume' {
  const ours = q.link?.kind === 'album' && q.link.id === albumId && q.currentAlbum === albumId
  if (!q.queuePlays || !ours || q.ended) return 'play'
  return q.sounding ? 'pause' : 'resume'
}
