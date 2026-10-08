// The rows of an artist's albums with their songs (ticket 100,
// blocks/AlbumSongs.svelte): a part heading ("Albums"), then for each album
// its head (title, year, counts, Play), its "Disc 2" labels and songs, and
// room for its cover when the songs are fewer than it is tall. Every row's
// height is known, so none is measured. No DOM.
import type { ItemKey } from '../../../shared/plugins/items'

// Where the cover goes at a width of the list: beside the songs, 168px,
// or 96px under 560px; under 400px it goes above them, in the album's head.
export interface CoverPlace {
  size: number
  side: boolean
}

export function coverPlace(width: number): CoverPlace {
  // not measured yet: as wide, so a kept place lands where it was
  if (width <= 0 || width >= 560) return { size: 168, side: true }
  return { size: 96, side: width >= 400 }
}

// The cover's column and the gap after it, which the rows beside it leave.
export const sideRoom = (c: CoverPlace): number => (c.side ? c.size + 24 : 0)

// Heights, in px. A part heading has 30px of room above it as on the
// sections look, but not right under the page's head. An album's head has
// 24px above its title, with a line, but not right under a part heading.
export const sizes = {
  part: 60,
  partTop: 30,
  headRoom: 24,
  // the title and the line under it, and the room before the songs
  head: 60,
  disc: 42,
  discFirst: 30,
  song: 54
}

export type AlbumRow =
  | { kind: 'part'; key: string; title: string; top: boolean }
  // first: the first album of its part, with no line and room above
  | { kind: 'album'; key: string; album: number; first: boolean }
  | { kind: 'disc'; key: string; album: number; label: string; first: boolean }
  // at: its place in its album; song: in the whole list
  | { kind: 'song'; key: string; album: number; at: number; song: number }
  // room for the cover beside a short album
  | { kind: 'pad'; key: string; album: number }

export interface AlbumInput {
  key: string
  items: readonly ItemKey[]
  // "Disc 2" before the song at `at`
  groups: readonly { at: number; label: string }[]
}

export interface AlbumLayout {
  rows: AlbumRow[]
  // each row's height and top in the list
  sizes: number[]
  tops: number[]
  total: number
  // every song in the order shown, one list for the keys and for selecting
  songs: ItemKey[]
  // the row of song i, and of album a's head
  songRow: number[]
  albumRow: number[]
  // the row after album a's last one
  albumEnd: number[]
  // the room above album a's title in its head row
  albumRoom: number[]
}

// `parts`: each part's title and albums, the albums numbered on through the
// parts. A part with no albums is left out.
export function albumSongRows(
  parts: readonly { title: string; albums: readonly AlbumInput[] }[],
  cover: CoverPlace
): AlbumLayout {
  const rows: AlbumRow[] = []
  const heights: number[] = []
  const songs: ItemKey[] = []
  const songRow: number[] = []
  const albumRow: number[] = []
  const albumEnd: number[] = []
  const albumRoom: number[] = []
  const push = (r: AlbumRow, h: number): void => {
    rows.push(r)
    heights.push(h)
  }
  // a cover above the songs makes the head as tall as it
  const headSize = cover.side ? sizes.head : Math.max(sizes.head, cover.size + 14)
  let a = 0
  for (const part of parts) {
    if (!part.albums.length) continue
    const top = !rows.length
    push(
      { kind: 'part', key: `part ${part.title}`, title: part.title, top },
      top ? sizes.partTop : sizes.part
    )
    part.albums.forEach((al, i) => {
      const first = i === 0
      const room = first ? 0 : sizes.headRoom
      albumRow.push(rows.length)
      albumRoom.push(room)
      push({ kind: 'album', key: `album ${al.key}`, album: a, first }, room + headSize)
      let tall = headSize
      let g = 0
      al.items.forEach((key, at) => {
        for (; g < al.groups.length && al.groups[g].at === at; g++) {
          const h = at === 0 ? sizes.discFirst : sizes.disc
          push(
            {
              kind: 'disc',
              key: `disc ${al.key} ${g}`,
              album: a,
              label: al.groups[g].label,
              first: at === 0
            },
            h
          )
          tall += h
        }
        songRow.push(rows.length)
        push(
          { kind: 'song', key: `song ${al.key} ${at}`, album: a, at, song: songs.length },
          sizes.song
        )
        songs.push(key)
        tall += sizes.song
      })
      // the cover beside a short album would reach into the next one
      const pad = cover.side ? cover.size - tall : 0
      if (pad > 0) push({ kind: 'pad', key: `pad ${al.key}`, album: a }, pad)
      albumEnd.push(rows.length)
      a++
    })
  }
  const tops: number[] = []
  let y = 0
  for (const h of heights) {
    tops.push(y)
    y += h
  }
  return { rows, sizes: heights, tops, total: y, songs, songRow, albumRow, albumEnd, albumRoom }
}

// The album row r is in (a part heading: the album after it).
export function albumAt(layout: AlbumLayout, r: number): number {
  for (let i = r; i < layout.rows.length; i++) {
    const row = layout.rows[i]
    if (row.kind !== 'part') return row.album
  }
  return -1
}

// The row to scroll to for song i: the rows above it too when it is the
// first of its album (its head, and the part heading over a part's first
// album), so Home and the arrows show them with it.
export function scrollRow(layout: AlbumLayout, i: number): number {
  let r = layout.songRow[i]
  if (r === undefined) return 0
  for (let up = r - 1; up >= 0; up--) {
    const k = layout.rows[up].kind
    if (k === 'song' || k === 'pad') break
    r = up
  }
  return r
}

// The albums with a row among rows `from` to `to`, for the covers to draw.
export function albumsIn(layout: AlbumLayout, from: number, to: number): number[] {
  const out: number[] = []
  for (let a = Math.max(0, albumAt(layout, from)); a < layout.albumRow.length; a++) {
    if (layout.albumRow[a] > to) break
    if (layout.albumEnd[a] > from) out.push(a)
  }
  return out
}
