import { describe, expect, it } from 'vitest'
import type { Album, Track } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'
import {
  chunk,
  filterAlbums,
  gridColumns,
  nextPlaylistSort,
  nextSort,
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
        codec: ''
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
  const { albums, tracks } = lib()
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
    expect(albums).toHaveLength(2)
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
