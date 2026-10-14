import { describe, expect, it } from 'vitest'
import { maxDropped } from '../../../shared/plugins/files/ipc'
import { addFolders, droppedPaths, pathKind, sortPaths } from './dropped'

// what is on this made-up disk
const dirs = new Set(['/music/jazz', '/music/rock', '/home/me/Music'])
const songs = new Set(['/x/a.flac', '/x/b.mp3', '/x/Live.cue'])
const kind = async (p: string): Promise<'dir' | 'song' | undefined> =>
  dirs.has(p) ? 'dir' : songs.has(p) ? 'song' : undefined

describe('pathKind', () => {
  const stat = (dir: boolean, file: boolean) => async () => ({
    isDirectory: () => dir,
    isFile: () => file
  })

  it('knows folders, audio files and cue sheets', async () => {
    expect(await pathKind('/music/jazz', stat(true, false))).toBe('dir')
    for (const p of ['/x/a.flac', '/x/b.MP3', '/x/c.ape', '/x/Live.cue'])
      expect(await pathKind(p, stat(false, true))).toBe('song')
  })

  it('leaves out other files and paths that are gone', async () => {
    expect(await pathKind('/x/notes.txt', stat(false, true))).toBeUndefined()
    expect(await pathKind('/x/.hidden.mp3', stat(false, true))).toBeUndefined()
    // a folder named like a song is still a folder
    expect(await pathKind('/x/odd.mp3', stat(true, false))).toBe('dir')
    const gone = async (): Promise<never> => {
      throw new Error('ENOENT')
    }
    expect(await pathKind('/x/gone.mp3', gone)).toBeUndefined()
  })
})

describe('sortPaths', () => {
  it('splits folders and songs, keeping the order of the songs', async () => {
    expect(await sortPaths(['/x/b.mp3', '/music/jazz', '/x/a.flac', '/music/rock/'], kind)).toEqual(
      { dirs: ['/music/jazz', '/music/rock'], songs: ['/x/b.mp3', '/x/a.flac'], other: 0 }
    )
  })

  it('takes each once', async () => {
    expect(await sortPaths(['/x/a.flac', '/x/a.flac', '/music/jazz', '/music/jazz'], kind)).toEqual(
      { dirs: ['/music/jazz'], songs: ['/x/a.flac'], other: 0 }
    )
  })

  it('counts other files, missing paths and anything that is not an absolute path', async () => {
    expect(
      await sortPaths(
        ['/x/notes.txt', '/gone', 'music/jazz', '', 42, null, { path: '/music/rock' }],
        kind
      )
    ).toEqual({ dirs: [], songs: [], other: 7 })
  })

  it('asks the disk only about absolute paths', async () => {
    const asked: string[] = []
    await sortPaths(['rel/path', '/music/jazz'], async (p) => (asked.push(p), 'dir'))
    expect(asked).toEqual(['/music/jazz'])
  })
})

describe('droppedPaths', () => {
  it('takes a list', () => {
    expect(droppedPaths(['/a', 3])).toEqual(['/a', 3])
  })

  it('takes nothing that is not a list of paths', () => {
    for (const v of ['/music/jazz', undefined, { 0: '/music/jazz' }])
      expect(droppedPaths(v)).toBeUndefined()
  })

  it('takes nothing from a list longer than a drop can be', () => {
    expect(droppedPaths(Array.from({ length: maxDropped + 1 }, () => '/x/a.flac'))).toBeUndefined()
  })
})

describe('addFolders', () => {
  // a settings store as main has it: readable or not, and its folder list
  type FakeStore = { readable: boolean; folders: string[]; get(): { folders: string[] } }
  function fakeStore(folders: string[], readable = true): FakeStore {
    const store: FakeStore = { readable, folders, get: () => ({ folders: store.folders }) }
    return store
  }

  it('adds folders that are not music folders yet, and counts the rest', () => {
    const set: string[][] = []
    const r = addFolders(['/home/me/Music', '/music/jazz'], fakeStore(['/home/me/Music']), (f) =>
      set.push(f)
    )
    expect(r).toEqual({ added: ['/music/jazz'], known: 1 })
    expect(set).toEqual([['/home/me/Music', '/music/jazz']])
  })

  it('does nothing while the settings file could not be read, and says so', () => {
    const set: string[][] = []
    const r = addFolders(['/music/jazz'], fakeStore([], false), (f) => set.push(f))
    expect(r).toEqual({ added: [], known: 0, unreadable: true })
    expect(set).toEqual([])
  })

  it('sets nothing when no folder was added', () => {
    const set: string[][] = []
    expect(
      addFolders(['/home/me/Music'], fakeStore(['/home/me/Music']), (f) => set.push(f))
    ).toEqual({ added: [], known: 1 })
    expect(addFolders([], fakeStore([], false), (f) => set.push(f))).toEqual({
      added: [],
      known: 0
    })
    expect(set).toEqual([])
  })
})
