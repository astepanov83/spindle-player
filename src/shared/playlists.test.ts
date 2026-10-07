import { describe, expect, it } from 'vitest'
import {
  addItems,
  cleanName,
  create,
  isKnownPlaylistsFile,
  nameForSongs,
  newName,
  parsePlaylists,
  putBack,
  remove,
  removedAt,
  removeItems,
  rename,
  reorderItems,
  type Playlist
} from './playlists'
import type { ItemKey } from './plugins/items'

const pl = (id: string, name: string, items: ItemKey[] = []): Playlist => ({
  id,
  name,
  items
})

describe('parsePlaylists', () => {
  it('gives no playlists for no file or a wrong one', () => {
    for (const raw of [undefined, null, 1, [], { playlists: 'x' }]) {
      expect(parsePlaylists(raw)).toEqual([])
    }
  })

  it('keeps a good file as it is', () => {
    const good = [pl('a', 'Road', ['files:t1', 'files:t2']), pl('b', 'Empty')]
    expect(parsePlaylists({ version: 2, playlists: good })).toEqual(good)
  })

  it('drops bad playlists, and bad and live items, on their own', () => {
    const raw = {
      playlists: [
        {
          id: 'a',
          name: 'Ok',
          items: ['files:t1', 7, '', 't3', 'radio:x', 'files:t2', 'files:t1']
        },
        { id: 'a', name: 'Same id' },
        { id: '', name: 'No id' },
        { id: 'c', name: 5 },
        'junk',
        { id: 'd', name: '  ', items: 'nope' }
      ]
    }
    expect(parsePlaylists(raw)).toEqual([
      pl('a', 'Ok', ['files:t1', 'files:t2']),
      pl('d', 'Playlist')
    ])
  })
})

describe('names', () => {
  it('cleans spaces and falls back when blank', () => {
    expect(cleanName('  Late   night ')).toBe('Late night')
    expect(cleanName('   ', 'Old')).toBe('Old')
    expect(cleanName('x'.repeat(300)).length).toBe(200)
  })

  it('numbers new names that are taken', () => {
    expect(newName([])).toBe('New playlist')
    expect(newName([pl('a', 'New playlist'), pl('b', 'New playlist 2')])).toBe('New playlist 3')
  })

  it('numbers a name made from songs when it is taken', () => {
    expect(newName([pl('a', 'Blue Hours')], 'Blue Hours')).toBe('Blue Hours 2')
    expect(newName([pl('a', 'Blue Hours'), pl('b', 'Blue Hours 2')], 'Blue Hours')).toBe(
      'Blue Hours 3'
    )
    expect(newName([pl('a', 'Kai')], 'Blue Hours')).toBe('Blue Hours')
  })
})

describe('nameForSongs', () => {
  const song = (
    albumId: string,
    album: string,
    artist: string
  ): { albumId: string; album: string; artist: string } => ({ albumId, album, artist })

  it('names songs of one album after the album', () => {
    expect(nameForSongs([song('b', 'Blue Hours', 'Marina Vale')])).toBe('Blue Hours')
    // a compilation: many artists, one album
    expect(nameForSongs([song('s', 'Summer Mix', 'DJ Sol'), song('s', 'Summer Mix', 'Kai')])).toBe(
      'Summer Mix'
    )
  })

  it("names songs of several albums after the first song's artist", () => {
    expect(
      nameForSongs([song('b', 'Blue Hours', 'Marina Vale'), song('r', 'Red Desert', 'Ochre')])
    ).toBe('Marina Vale')
    // two albums with one title are still two albums
    expect(nameForSongs([song('x', 'Hits', 'A'), song('y', 'Hits', 'B')])).toBe('A')
  })

  it('falls back to New playlist when there is no name to use', () => {
    expect(nameForSongs([])).toBe('New playlist')
    expect(nameForSongs([song('b', ' ', 'Kai')])).toBe('Kai')
    expect(nameForSongs([song('b', '', ''), song('c', '', '  ')])).toBe('New playlist')
  })

  it('keeps a long name within the limit', () => {
    expect(nameForSongs([song('b', 'x'.repeat(300), 'Kai')])).toHaveLength(200)
  })
})

describe('edits', () => {
  const list = [pl('a', 'A', ['files:t1']), pl('b', 'B')]

  it('creates at the end without doubles', () => {
    expect(create(list, 'c', ' C ', ['files:t1', 'files:t1', 'files:t2'])).toEqual([
      ...list,
      pl('c', 'C', ['files:t1', 'files:t2'])
    ])
  })

  it('renames, keeping the old name for a blank one', () => {
    expect(rename(list, 'a', 'Z')[0].name).toBe('Z')
    expect(rename(list, 'a', ' ')[0].name).toBe('A')
  })

  it('removes a playlist', () => {
    expect(remove(list, 'a')).toEqual([pl('b', 'B')])
  })

  it('adds songs at the end, skipping ones already there', () => {
    const r = addItems(list, 'a', ['files:t2', 'files:t1', 'files:t3', 'files:t2'])
    expect(r.added).toBe(2)
    expect(r.list[0].items).toEqual(['files:t1', 'files:t2', 'files:t3'])
    expect(r.list[1]).toBe(list[1])
  })

  it('leaves the list as it is when nothing is new', () => {
    const r = addItems(list, 'a', ['files:t1'])
    expect(r).toEqual({ list, added: 0 })
    expect(r.list).toBe(list)
  })

  it('removes songs', () => {
    expect(
      removeItems([pl('a', 'A', ['files:t1', 'files:t2', 'files:t3'])], 'a', ['files:t2'])[0].items
    ).toEqual(['files:t1', 'files:t3'])
  })
})

describe('putting removed songs back (ticket 071)', () => {
  const keys = (...n: number[]): ItemKey[] => n.map((i) => `files:t${i}` as ItemKey)
  const list = [pl('a', 'A', keys(1, 2, 3, 4, 5)), pl('b', 'B', keys(1))]

  it('finds each removed song with its place', () => {
    expect(removedAt(list, 'a', keys(4, 2, 9))).toEqual([
      { key: 'files:t2', at: 1 },
      { key: 'files:t4', at: 3 }
    ])
    expect(removedAt(list, 'gone', keys(1))).toEqual([])
  })

  it('puts them back at their places', () => {
    const taken = removedAt(list, 'a', keys(1, 4, 5))
    const after = removeItems(list, 'a', keys(1, 4, 5))
    const back = putBack(after, 'a', taken.reverse())
    expect(back[0].items).toEqual(keys(1, 2, 3, 4, 5))
    expect(back[1]).toBe(list[1])
  })

  it('puts one at the end when the playlist got shorter, and skips one added again', () => {
    const taken = removedAt(list, 'a', keys(2, 5))
    const after = removeItems(list, 'a', keys(2, 3, 4, 5))
    expect(putBack(after, 'a', taken)[0].items).toEqual(keys(1, 2, 5))
    const again = addItems(removeItems(list, 'a', keys(2)), 'a', keys(2)).list
    expect(putBack(again, 'a', removedAt(list, 'a', keys(2)))).toBe(again)
  })

  it('does nothing for a playlist that is gone', () => {
    const after = remove(list, 'a')
    expect(putBack(after, 'a', [{ key: 'files:t1', at: 0 }])).toBe(after)
  })
})

describe('isKnownPlaylistsFile', () => {
  it('knows a file the next save writes back the same', () => {
    expect(isKnownPlaylistsFile({ version: 2, playlists: [] })).toBe(true)
    expect(
      isKnownPlaylistsFile({ version: 2, playlists: [pl('a', 'Mix', ['files:t1', 'files:t2'])] })
    ).toBe(true)
  })

  it('does not know another version, a wrong shape, or a file the save would cut', () => {
    for (const raw of [
      { version: 1, playlists: [{ id: 'a', name: 'Mix', trackIds: [] }] },
      { version: 3, playlists: [pl('a', 'Mix')] },
      { playlists: [] },
      { version: 2, playlists: {} },
      [],
      'x',
      { version: 2, playlists: [pl('a', 'Mix'), { id: 'b' }] },
      { version: 2, playlists: [pl('a', 'Mix', ['files:t1', 'files:t1'])] },
      { version: 2, playlists: [{ ...pl('a', 'Mix'), smart: true }] }
    ])
      expect(isKnownPlaylistsFile(raw)).toBe(false)
  })
})

describe('reorderItems (ticket 089)', () => {
  const k = (...n: number[]): ItemKey[] => n.map((i) => `files:t${i}` as ItemKey)
  const list = [pl('a', 'Mix', k(1, 2, 3, 4, 5)), pl('b', 'Other', k(1))]

  it('puts the songs in the new order', () => {
    const out = reorderItems(list, 'a', k(3, 1, 2, 4, 5))
    expect(out[0].items).toEqual(k(3, 1, 2, 4, 5))
    expect(out[1]).toBe(list[1])
  })

  it('keeps songs not shown at their places', () => {
    // 2 and 4 are not in the library now: the shown songs move around them
    const out = reorderItems(list, 'a', k(5, 1, 3))
    expect(out[0].items).toEqual(k(5, 2, 1, 4, 3))
  })

  it('changes nothing for the same order, other songs, or a playlist that is gone', () => {
    expect(reorderItems(list, 'a', k(1, 2, 3, 4, 5))).toBe(list)
    expect(reorderItems(list, 'a', k(2, 1, 9))).toBe(list)
    expect(reorderItems(list, 'a', k(2, 2, 1))).toBe(list)
    expect(reorderItems(list, 'x', k(1))).toBe(list)
  })
})
