import { describe, expect, it, vi } from 'vitest'
import type { Album, Track } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'
import {
  heldShift,
  placeShift,
  chunk,
  filterAlbums,
  gridColumns,
  nextPlaylistSort,
  nextSort,
  withPlaylistSort,
  playlistRows,
  songRows,
  sortRows,
  songMatches,
  searchSongs,
  filterSongs,
  filterPlaylists,
  filterItems,
  sortItems
} from './views'
import type { ItemKey } from '../../../shared/plugins/items'
import type { ItemInfo } from '../plugins/types'

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
      added: 0,
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

  it('songs: also single songs by their own artist', () => {
    const t = { ...track('b/2'), artist: 'Guest Star' }
    expect(songRows(albums, (id) => (id === 'b/2' ? t : track(id)), 'guest')).toEqual([t])
  })
})

describe('search results (ticket 039)', () => {
  const { albums, tracks } = lib()
  const track = (id: string): Track => tracks.get(id)!
  const song = (title: string, artist: string, album = 'Any'): Track => ({
    ...track('a/0'),
    title,
    artist,
    album
  })

  it('a song matches by its title or its own artist, ignoring case and spaces', () => {
    expect(songMatches(song('Harbor Lights', 'Oda Linde'), 'harbor')).toBe(true)
    expect(songMatches(song('Harbor Lights', 'Oda Linde'), '  LIGHTS ')).toBe(true)
    expect(songMatches(song('Harbor Lights', 'Oda Linde'), 'linde')).toBe(true)
    expect(songMatches(song('Harbor Lights', 'Oda Linde'), 'night bus')).toBe(false)
  })

  it('not by its album: albums have their own group', () => {
    expect(songMatches(song('Route 38', 'X', 'Night Bus'), 'night bus')).toBe(false)
  })

  it('matches Cyrillic and Japanese in any case', () => {
    expect(songMatches(song('Группа крови', 'КИНО'), 'кино')).toBe(true)
    expect(songMatches(song('ГРУППА КРОВИ', 'Кино'), 'группа')).toBe(true)
    expect(songMatches(song('夜に駆ける', 'YOASOBI'), '駆ける')).toBe(true)
    expect(songMatches(song('Straße', 'Ärzte'), 'ärzte')).toBe(true)
  })

  it('matches a composed letter typed as two code points', () => {
    // "é" as e + combining accent, as some file systems store it
    expect(songMatches(song('Café', 'X'), 'cafe\u0301')).toBe(true)
    expect(songMatches(song('Cafe\u0301', 'X'), 'café')).toBe(true)
  })

  it('matches without accents: "bjork" finds Björk, "cafe" finds Café', () => {
    expect(songMatches(song('Jóga', 'Björk'), 'bjork')).toBe(true)
    expect(songMatches(song('Café', 'X'), 'cafe')).toBe(true)
    expect(songMatches(song('Cafe', 'X'), 'café')).toBe(true)
    expect(songMatches(song('Jóga', 'Björk'), 'JOGA')).toBe(true)
    expect(
      filterAlbums(
        albums.map((a) => ({ ...a, artist: 'Sigur Rós' })),
        'ros'
      )
    ).toHaveLength(2)
    expect(filterPlaylists([{ name: 'Été' }], 'ete')).toHaveLength(1)
  })

  it('keeps Cyrillic and Japanese letters whole when it drops accents', () => {
    // й and ё lose their marks too, so и and е find them
    expect(songMatches(song('Ёлка', 'Мой'), 'елка')).toBe(true)
    expect(songMatches(song('Ёлка', 'Мой'), 'мои')).toBe(true)
    expect(songMatches(song('Ёлка', 'Мой'), 'ёлка')).toBe(true)
    // kana with voicing marks stay as they are: が is not か
    expect(songMatches(song('ながれ', 'X'), 'ながれ')).toBe(true)
    expect(songMatches(song('ながれ', 'X'), 'なかれ')).toBe(false)
  })

  it('folds each song once, then only the search text on each key', () => {
    const many = Array.from({ length: 50 }, (_, i) => song(`Song ${i}`, 'Björk'))
    const al = { ...albums[0], trackIds: many.map((t) => t.id) }
    const byId = new Map(many.map((t, i) => [t.id + i, t]))
    const ids = [...byId.keys()]
    const lib2 = [{ ...al, trackIds: ids }]
    searchSongs(lib2, (id) => byId.get(id)!, 'bjork')
    const spy = vi.spyOn(String.prototype, 'normalize')
    expect(searchSongs(lib2, (id) => byId.get(id)!, 'bjo')).toHaveLength(50)
    // NFD and NFC of the text typed, nothing per song
    expect(spy.mock.calls.length).toBeLessThanOrEqual(4)
    spy.mockRestore()
  })

  it('a changed song is a new object and matches by its new text', () => {
    const old = song('Old Name', 'Björk')
    expect(songMatches(old, 'old')).toBe(true)
    const changed = { ...old, title: 'New Name', artist: 'Sigur Rós' }
    expect(songMatches(changed, 'old')).toBe(false)
    expect(songMatches(changed, 'new name')).toBe(true)
    expect(songMatches(changed, 'bjork')).toBe(false)
    expect(songMatches(changed, 'ros')).toBe(true)
    expect(filterSongs([changed], 'old')).toEqual([])
    expect(songMatches(old, 'bjork')).toBe(true)
  })

  it('lists matching songs in library order', () => {
    // Terminus by its artist, The Quiet Hours; the rest by Oda Linde
    expect(searchSongs(albums, track, 'n').map((t) => t.title)).toEqual([
      'Terminus',
      'Origami',
      'Paper Suns',
      'Kite String'
    ])
    expect(searchSongs(albums, track, '  ')).toEqual([])
  })

  it('filters a playlist by title, artist or album', () => {
    const rows = [song('One', 'Ann', 'First'), song('Two', 'Bob', 'Second')]
    expect(filterSongs(rows, 'two')).toEqual([rows[1]])
    expect(filterSongs(rows, 'ann')).toEqual([rows[0]])
    expect(filterSongs(rows, 'second')).toEqual([rows[1]])
    expect(filterSongs(rows, '')).toBe(rows)
  })

  it('filters playlists by name', () => {
    const list = [
      { id: '1', name: 'Road Trip', trackIds: [] },
      { id: '2', name: 'Дорога', trackIds: [] }
    ]
    expect(filterPlaylists(list, 'road')).toEqual([list[0]])
    expect(filterPlaylists(list, 'ДОРОГА')).toEqual([list[1]])
    expect(filterPlaylists(list, ' ')).toBe(list)
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

  it('holds an item in its row when fewer than a row came above it', () => {
    // 3 per row; "e" (row 1) is held
    const old = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(heldShift(old, ['x', ...old], 4, 3, id)).toEqual({ rows: 0, held: 'e' })
    // two more came: "e" is now in row 2
    expect(heldShift(['x', ...old], ['x', 'y', 'z', ...old], 5, 3, id)).toEqual({
      rows: 1,
      held: 'e'
    })
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

  it('leaves out songs that are gone and counts them; off ones stay', () => {
    const gone = new Set(['files:gone', 'files:gone2'])
    const r = playlistRows(['files:b/0', 'files:gone', 'mfp:off', 'files:gone2'], (k) =>
      gone.has(k)
    )
    expect(r.rows).toEqual(['files:b/0', 'mfp:off'])
    expect(r.missing).toBe(2)
  })
})

describe('songs as items (ticket 056)', () => {
  const infos = new Map<string, ItemInfo>([
    ['files:1', { title: 'Kite String', subtitle: 'Ochre', group: 'Red', length: 200 }],
    ['mfp:2', { title: 'Terminus', subtitle: 'Anna', group: 'Episode 1', length: 90 }],
    ['files:3', { title: 'Kite String', subtitle: 'Björk', group: 'Blue', length: 120 }]
  ])
  const info = (k: ItemKey): ItemInfo | undefined => infos.get(k)
  const keys: ItemKey[] = ['files:1', 'mfp:off', 'mfp:2', 'files:3']

  it('sort by what each plugin says; ties and greyed ones keep their order', () => {
    expect(sortItems(keys, { k: 't', dir: 1 }, info)).toEqual([
      'mfp:off',
      'files:1',
      'files:3',
      'mfp:2'
    ])
    expect(sortItems(keys, { k: 'd', dir: -1 }, info)).toEqual([
      'files:1',
      'files:3',
      'mfp:2',
      'mfp:off'
    ])
    expect(sortItems(keys, null, info)).toBe(keys)
  })

  it('filter by title, artist or album, without accents; greyed ones never match', () => {
    expect(filterItems(keys, 'bjork', info)).toEqual(['files:3'])
    expect(filterItems(keys, 'episode', info)).toEqual(['mfp:2'])
    expect(filterItems(keys, 'kite', info)).toEqual(['files:1', 'files:3'])
    expect(filterItems(keys, '', info)).toBe(keys)
  })
})
