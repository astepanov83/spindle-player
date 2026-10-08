import { describe, expect, it } from 'vitest'
import type { ItemKey } from '../../../shared/plugins/items'
import { listStep } from '../keys'
import { clickSelect, listRows, noneSelected, stepSelect } from '../ui/selection'
import { albumsIn, albumSongRows, coverPlace, scrollRow, sideRoom, sizes } from './album-song-rows'

// plain ids: the core names no plugin
const songs = (album: string, n: number): ItemKey[] =>
  Array.from({ length: n }, (_, i) => `${album}${i + 1}`) as ItemKey[]

// Albums: North (2 discs of 2), Rain (1 song). Singles and EPs: Small (3).
const parts = [
  {
    title: 'Albums',
    albums: [
      {
        key: 'album/north',
        items: songs('n', 4),
        groups: [
          { at: 0, label: 'Disc 1' },
          { at: 2, label: 'Disc 2' }
        ]
      },
      { key: 'album/rain', items: songs('r', 1), groups: [] }
    ]
  },
  { title: 'Singles and EPs', albums: [{ key: 'album/small', items: songs('s', 3), groups: [] }] },
  { title: 'Empty', albums: [] }
]
const wide = albumSongRows(parts, coverPlace(900))
const kinds = (l = wide): string[] =>
  l.rows.map((r) => (r.kind === 'song' ? `${r.album}:${r.at}` : r.kind))

describe('coverPlace: the cover beside the songs, smaller, then above them (ticket 100)', () => {
  it('168px beside, 96px under 560px of list, above them under 400px', () => {
    expect(coverPlace(900)).toEqual({ size: 168, side: true })
    expect(coverPlace(560)).toEqual({ size: 168, side: true })
    expect(coverPlace(559)).toEqual({ size: 96, side: true })
    // Studio's narrow library
    expect(coverPlace(408)).toEqual({ size: 96, side: true })
    expect(coverPlace(399)).toEqual({ size: 96, side: false })
    // before the list is measured, as wide
    expect(coverPlace(0)).toEqual({ size: 168, side: true })
    expect(sideRoom(coverPlace(900))).toBe(192)
    expect(sideRoom(coverPlace(300))).toBe(0)
  })
})

describe('the rows of the albums with their songs', () => {
  it('a heading per part, then each album: head, disc labels, songs, room for a short one', () => {
    expect(kinds()).toEqual([
      'part',
      'album',
      'disc',
      '0:0',
      '0:1',
      'disc',
      '0:2',
      '0:3',
      'album',
      '1:0',
      'pad',
      'part',
      'album',
      '2:0',
      '2:1',
      '2:2'
    ])
    // an empty part is left out
    expect(
      wide.rows.filter((r) => r.kind === 'part').map((r) => r.kind === 'part' && r.title)
    ).toEqual(['Albums', 'Singles and EPs'])
  })

  it('the songs of every album are one list, each knowing its row', () => {
    expect(wide.songs).toEqual([...songs('n', 4), ...songs('r', 1), ...songs('s', 3)])
    expect(wide.songRow).toEqual([3, 4, 6, 7, 9, 13, 14, 15])
    expect(wide.albumRow).toEqual([1, 8, 12])
    expect(wide.albumEnd).toEqual([8, 11, 16])
  })

  it('known heights: room above a part and an album, not right under the head', () => {
    const { part, partTop, head, headRoom, disc, discFirst, song } = sizes
    expect(wide.sizes.slice(0, 9)).toEqual([
      partTop,
      head,
      discFirst,
      song,
      song,
      disc,
      song,
      song,
      headRoom + head
    ])
    expect(wide.albumRoom).toEqual([0, headRoom, 0])
    expect(wide.sizes[11]).toBe(part)
    // the tops add up
    expect(wide.tops[3]).toBe(partTop + head + discFirst)
    expect(wide.total).toBe(wide.sizes.reduce((s, h) => s + h, 0))
  })

  it("a short album gets room for its cover beside it, so it doesn't reach the next", () => {
    // Rain: its head and one song are less than the 168px cover
    expect(wide.sizes[10]).toBe(168 - sizes.head - sizes.song)
    // its run from the title down is as tall as the cover
    expect(wide.tops[11] - wide.tops[8] - wide.albumRoom[1]).toBe(168)
    // Small Hours: 60 + 3 x 54 is taller, no room
    expect(kinds().at(-1)).toBe('2:2')
  })

  it('a cover above the songs needs no room, and its head is as tall as the cover', () => {
    const narrow = albumSongRows(parts, coverPlace(300))
    expect(kinds(narrow)).not.toContain('pad')
    expect(narrow.sizes[narrow.albumRow[0]]).toBe(96 + 14)
    expect(narrow.sizes[narrow.albumRow[1]]).toBe(sizes.headRoom + 96 + 14)
  })
})

describe('the keys in the albums with their songs', () => {
  it('the arrows go from song to song across albums, skipping the other rows', () => {
    // the roving list counts songs: from North's last to Rain's only song
    expect(listStep('ArrowDown', 3, wide.songs.length, 5)).toBe(4)
    expect(wide.rows[wide.songRow[4]]).toMatchObject({ kind: 'song', album: 1, at: 0 })
  })

  it("a jump to an album's first song shows its head, and the part heading over the first", () => {
    expect(scrollRow(wide, 0)).toBe(0)
    expect(scrollRow(wide, 1)).toBe(4)
    // the first song after a disc label shows the label too
    expect(scrollRow(wide, 2)).toBe(5)
    expect(scrollRow(wide, 4)).toBe(8)
    expect(scrollRow(wide, 5)).toBe(11)
  })

  it('the albums with a row drawn, for their covers', () => {
    expect(albumsIn(wide, 0, 3)).toEqual([0])
    expect(albumsIn(wide, 5, 9)).toEqual([0, 1])
    // a part heading: the album under it
    expect(albumsIn(wide, 11, 11)).toEqual([])
    expect(albumsIn(wide, 10, 13)).toEqual([1, 2])
    expect(albumsIn(wide, 14, 40)).toEqual([2])
  })
})

describe('selecting in the albums with their songs (086)', () => {
  const rows = listRows(wide.songs)
  const none = { ctrl: false, shift: false }

  it('Shift+click runs from a song of one album into the next', () => {
    // a click on North's third song, then Shift+click on Small Hours' first
    const clicked = clickSelect(noneSelected<string>(), rows, 2, none)
    const range = clickSelect(clicked, rows, 5, { ctrl: false, shift: true })
    expect([...range.ids]).toEqual(['n3', 'n4', 'r1', 's1'])
  })

  it("Shift+Down from the last song of an album takes the next album's first", () => {
    const s = stepSelect(noneSelected<string>(), rows, 3, 4)
    expect([...s.ids]).toEqual(['n4', 'r1'])
  })
})
