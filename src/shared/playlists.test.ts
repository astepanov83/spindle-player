import { describe, expect, it } from 'vitest'
import {
  addTracks,
  cleanName,
  create,
  isKnownPlaylistsFile,
  newName,
  parsePlaylists,
  remove,
  removeTracks,
  rename,
  type Playlist
} from './playlists'

const pl = (id: string, name: string, trackIds: string[] = []): Playlist => ({
  id,
  name,
  trackIds
})

describe('parsePlaylists', () => {
  it('gives no playlists for no file or a wrong one', () => {
    for (const raw of [undefined, null, 1, [], { playlists: 'x' }]) {
      expect(parsePlaylists(raw)).toEqual([])
    }
  })

  it('keeps a good file as it is', () => {
    const good = [pl('a', 'Road', ['t1', 't2']), pl('b', 'Empty')]
    expect(parsePlaylists({ version: 1, playlists: good })).toEqual(good)
  })

  it('drops bad playlists and bad ids on their own', () => {
    const raw = {
      playlists: [
        { id: 'a', name: 'Ok', trackIds: ['t1', 7, '', 't2', 't1'] },
        { id: 'a', name: 'Same id' },
        { id: '', name: 'No id' },
        { id: 'c', name: 5 },
        'junk',
        { id: 'd', name: '  ', trackIds: 'nope' }
      ]
    }
    expect(parsePlaylists(raw)).toEqual([pl('a', 'Ok', ['t1', 't2']), pl('d', 'Playlist')])
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
})

describe('edits', () => {
  const list = [pl('a', 'A', ['t1']), pl('b', 'B')]

  it('creates at the end without doubles', () => {
    expect(create(list, 'c', ' C ', ['t1', 't1', 't2'])).toEqual([
      ...list,
      pl('c', 'C', ['t1', 't2'])
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
    const r = addTracks(list, 'a', ['t2', 't1', 't3', 't2'])
    expect(r.added).toBe(2)
    expect(r.list[0].trackIds).toEqual(['t1', 't2', 't3'])
    expect(r.list[1]).toBe(list[1])
  })

  it('leaves the list as it is when nothing is new', () => {
    const r = addTracks(list, 'a', ['t1'])
    expect(r).toEqual({ list, added: 0 })
    expect(r.list).toBe(list)
  })

  it('removes songs', () => {
    expect(removeTracks([pl('a', 'A', ['t1', 't2', 't3'])], 'a', ['t2'])[0].trackIds).toEqual([
      't1',
      't3'
    ])
  })
})

describe('isKnownPlaylistsFile', () => {
  it('knows a file the next save writes back the same', () => {
    expect(isKnownPlaylistsFile({ version: 1, playlists: [] })).toBe(true)
    expect(isKnownPlaylistsFile({ version: 1, playlists: [pl('a', 'Mix', ['t1', 't2'])] })).toBe(
      true
    )
  })

  it('does not know another version, a wrong shape, or a file the save would cut', () => {
    for (const raw of [
      { version: 2, playlists: [pl('a', 'Mix')] },
      { playlists: [] },
      { version: 1, playlists: {} },
      [],
      'x',
      { version: 1, playlists: [pl('a', 'Mix'), { id: 'b' }] },
      { version: 1, playlists: [pl('a', 'Mix', ['t1', 't1'])] },
      { version: 1, playlists: [{ ...pl('a', 'Mix'), smart: true }] }
    ])
      expect(isKnownPlaylistsFile(raw)).toBe(false)
  })
})
