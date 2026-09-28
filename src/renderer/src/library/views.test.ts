import { describe, expect, it } from 'vitest'
import type { Album, Track } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'
import {
  placeShift,
  chunk,
  filterAlbums,
  gridColumns,
  nextPlaylistSort,
  nextSort,
  withPlaylistSort,
  playlistRows,
  songRows,
  sortRows
} from './views'

function lib(): { albums: Album[]; tracks: Map<string, Track> } {
  const tracks = new Map<string, Track>()
  const mk = (id: string, title: string, artist: string, songs: [string, number][]): Album => {
    const ids = songs.map(([name, d], i) => {
      const t: Track = {
        id: `${id}/${i}`,
        title: name,
        duration: d,
        albumId: id,
        artist,
        album: title,
        no: i + 1,
        disc: 1,
        codec: '',
        folder: 0
      }
      tracks.set(t.id, t)
      return t.id
    })
    return {
      id,
      title,
      artist,
      year: 2020,
      palette: defaultPalettes,
      cover: '',
      coverLarge: '',
      trackIds: ids
    }
  }
  const albums = [
    mk('a', 'Night Bus', 'The Quiet Hours', [
      ['Route 38', 203],
      ['Terminus', 264]
    ]),
    mk('b', 'Paper Suns', 'Oda Linde', [
      ['Origami', 182],
      ['Paper Suns', 238],
      ['Kite String', 201]
    ])
  ]
  return { albums, tracks }
}

describe('search', () => {
  const { albums, tracks } = lib()
  const track = (id: string): Track => tracks.get(id)!

  it('matches album title or artist, ignoring case and spaces', () => {
    expect(filterAlbums(albums, '  oda ').map((a) => a.id)).toEqual(['b'])
    expect(filterAlbums(albums, 'night').map((a) => a.id)).toEqual(['a'])
    expect(filterAlbums(albums, '')).toBe(albums)
  })

  it('songs: whole album when the album matches, single songs by title', () => {
    expect(songRows(albums, track, 'quiet').map((t) => t.title)).toEqual(['Route 38', 'Terminus'])
    expect(songRows(albums, track, 'kite').map((t) => t.title)).toEqual(['Kite String'])
    expect(songRows(albums, track, '')).toHaveLength(5)
  })
})

describe('sort', () => {
  const { tracks } = lib()
  const all = [...tracks.values()]
  const order = (t: Track): number => all.indexOf(t)

  it('sorts by title, and the other way on a second click', () => {
    const s = nextSort({ k: 'a', dir: 1 }, 't')
    expect(s).toEqual({ k: 't', dir: 1 })
    expect(sortRows(all, s, order).map((t) => t.title)[0]).toBe('Kite String')
    const back = nextSort(s, 't')
    expect(back).toEqual({ k: 't', dir: -1 })
    expect(sortRows(all, back, order).map((t) => t.title)[0]).toBe('Terminus')
  })

  it('by duration, numbers not strings', () => {
    expect(sortRows(all, { k: 'd', dir: 1 }, order).map((t) => t.duration)).toEqual([
      182, 201, 203, 238, 264
    ])
  })

  it('ties keep library order', () => {
    const shuffled = [all[4], all[2], all[0], all[3], all[1]]
    expect(sortRows(shuffled, { k: 'a', dir: 1 }, order).map((t) => t.id)).toEqual([
      'b/0',
      'b/1',
      'b/2',
      'a/0',
      'a/1'
    ])
    // reversed, the ties still keep library order
    expect(sortRows(shuffled, { k: 'a', dir: -1 }, order).map((t) => t.id)).toEqual([
      'a/0',
      'a/1',
      'b/0',
      'b/1',
      'b/2'
    ])
  })
})

describe('placeShift', () => {
  const id = (s: string): string => s
  it('moves the view by the rows that came above the first row shown', () => {
    // row 2 ("c") was first on screen; two songs came before it
    expect(placeShift(['a', 'b', 'c', 'd'], ['a', 'x', 'b', 'y', 'c', 'd'], 2, 1, id)).toBe(2)
  })

  it('does nothing at the top, so new songs show there', () => {
    expect(placeShift(['a', 'b'], ['x', 'a', 'b'], 0, 1, id)).toBe(0)
  })

  it('counts grid rows: albums that came above move the first album down a row', () => {
    // 3 per row; row 1 starts with "d"
    const old = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(placeShift(old, ['x', 'y', 'z', ...old], 1, 3, id)).toBe(1)
    // one album above: "d" is now in the same row, one place on
    expect(placeShift(old, ['x', ...old], 1, 3, id)).toBe(0)
  })

  it('moves by the rows the list grew when it is scrolled past its end', () => {
    expect(placeShift(['a', 'b'], ['a', 'x', 'b'], 5, 1, id)).toBe(1)
    expect(placeShift(['a', 'b', 'c'], ['a', 'x', 'b', 'c'], 3, 3, id)).toBe(1)
    expect(placeShift(['a', 'b', 'c'], ['a', 'b'], 4, 1, id)).toBe(-1)
  })

  it('holds on to the next row shown when the first one left', () => {
    expect(placeShift(['a', 'b', 'c', 'd'], ['x', 'y', 'a', 'z', 'd'], 1, 1, id)).toBe(1)
  })
})

describe('grid', () => {
  it('fits tiles of at least 140px with 16px gaps', () => {
    expect(gridColumns(100)).toBe(1)
    expect(gridColumns(140)).toBe(1)
    expect(gridColumns(296)).toBe(2)
    expect(gridColumns(295)).toBe(1)
    expect(gridColumns(0)).toBe(1)
  })

  it('splits items into rows', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
  })
})

describe('playlist views', () => {
  it('keeps playlist order with no sort', () => {
    const { tracks } = lib()
    const rows = [...tracks.values()].reverse()
    expect(sortRows(rows, null, () => 0)).toBe(rows)
  })

  it('goes sorted up, sorted down, then back to playlist order', () => {
    const a = nextPlaylistSort(null, 't')
    expect(a).toEqual({ k: 't', dir: 1 })
    const b = nextPlaylistSort(a, 't')
    expect(b).toEqual({ k: 't', dir: -1 })
    expect(nextPlaylistSort(b, 't')).toBeNull()
    expect(nextPlaylistSort(b, 'a')).toEqual({ k: 'a', dir: 1 })
  })

  it('keeps a sort per playlist, and drops it when back in playlist order', () => {
    const up = { k: 't', dir: 1 } as const
    const one = withPlaylistSort({}, 'p1', up)
    const two = withPlaylistSort(one, 'p2', { k: 'd', dir: -1 })
    expect(two).toEqual({ p1: up, p2: { k: 'd', dir: -1 } })
    // the old value is left as it was, so a store holding it sees a new object
    expect(one).toEqual({ p1: up })
    expect(withPlaylistSort(two, 'p1', null)).toEqual({ p2: { k: 'd', dir: -1 } })
  })

  it('leaves out songs that are not in the library and counts them', () => {
    const { tracks } = lib()
    const r = playlistRows(
      ['b/0', 'gone', 'a/1', 'gone2'],
      (id) => tracks.has(id),
      (id) => tracks.get(id)!
    )
    expect(r.rows.map((t) => t.id)).toEqual(['b/0', 'a/1'])
    expect(r.missing).toBe(2)
  })
})
