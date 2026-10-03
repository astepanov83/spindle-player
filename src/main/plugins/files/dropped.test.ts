import { describe, expect, it } from 'vitest'
import { maxDropped } from '../../../shared/plugins/files/ipc'
import { addDropped, droppedFolders } from './dropped'

// folders that exist on this made-up disk
const dirs = new Set(['/music/jazz', '/music/rock', '/home/me/Music'])
const isDir = async (p: string): Promise<boolean> => dirs.has(p)

describe('droppedFolders', () => {
  it('adds folders that exist and are not music folders yet', async () => {
    expect(
      await droppedFolders(['/music/jazz', '/music/rock/'], ['/home/me/Music'], isDir)
    ).toEqual({ added: ['/music/jazz', '/music/rock'], known: 0, other: 0 })
  })

  it('counts a music folder it has already, and adds it once', async () => {
    expect(
      await droppedFolders(
        ['/home/me/Music', '/music/jazz', '/music/jazz'],
        ['/home/me/Music'],
        isDir
      )
    ).toEqual({ added: ['/music/jazz'], known: 1, other: 0 })
  })

  it('leaves out files, missing paths and anything that is not an absolute path', async () => {
    expect(
      await droppedFolders(
        ['/music/jazz/song.mp3', '/gone', 'music/jazz', '', 42, null, { path: '/music/rock' }],
        [],
        isDir
      )
    ).toEqual({ added: [], known: 0, other: 7 })
  })

  it('takes nothing that is not a list of paths', async () => {
    for (const v of ['/music/jazz', undefined, { 0: '/music/jazz' }])
      expect(await droppedFolders(v, [], isDir)).toEqual({ added: [], known: 0, other: 0 })
  })

  it('takes nothing from a list longer than a drop can be', async () => {
    const many = Array.from({ length: maxDropped + 1 }, () => '/music/jazz')
    expect(await droppedFolders(many, [], isDir)).toEqual({ added: [], known: 0, other: 0 })
  })

  it('asks the disk only about absolute paths', async () => {
    const asked: string[] = []
    await droppedFolders(['rel/path', '/music/jazz'], [], async (p) => (asked.push(p), true))
    expect(asked).toEqual(['/music/jazz'])
  })
})

describe('addDropped', () => {
  // a settings store as main has it: readable or not, and its folder list
  type FakeStore = { readable: boolean; folders: string[]; get(): { folders: string[] } }
  function fakeStore(folders: string[], readable = true): FakeStore {
    const store: FakeStore = { readable, folders, get: () => ({ folders: store.folders }) }
    return store
  }

  it('does nothing while the settings file could not be read, and says so', async () => {
    const store = fakeStore([], false)
    const asked: string[] = []
    const set: string[][] = []
    const r = await addDropped(
      ['/music/jazz'],
      store,
      async (p) => (asked.push(p), true),
      (f) => set.push(f)
    )
    expect(r).toEqual({ added: [], known: 0, other: 0, unreadable: true })
    expect(asked).toEqual([])
    expect(set).toEqual([])
  })

  it('adds to the folder list as it is after the disk answered', async () => {
    const store = fakeStore(['/home/me/Music'])
    const set: string[][] = []
    // a folder the picker added while the disk was asked
    const slowDir = async (p: string): Promise<boolean> => {
      store.folders = [...store.folders, '/music/rock']
      return isDir(p)
    }
    const r = await addDropped(['/music/jazz'], store, slowDir, (f) => set.push(f))
    expect(r.added).toEqual(['/music/jazz'])
    expect(set).toEqual([['/home/me/Music', '/music/rock', '/music/jazz']])
  })

  it('sets nothing when no folder was added', async () => {
    const set: string[][] = []
    await addDropped(['/home/me/Music', '/gone'], fakeStore(['/home/me/Music']), isDir, (f) =>
      set.push(f)
    )
    expect(set).toEqual([])
  })
})
