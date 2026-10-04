import { describe, expect, it } from 'vitest'
import type { Folder, Track } from '../../../../shared/library'
import {
  commonFolder,
  crumbs,
  filterFolder,
  folderParts,
  folderPath,
  folderPlaySongs,
  folderSearchText,
  folderSongs,
  folderTree,
  rootName,
  shownFolder,
  type FolderTree
} from './folders'

const track = (id: string, folder: number, albumId = 'al', more: Partial<Track> = {}): Track => ({
  id,
  title: id,
  duration: 60,
  albumId,
  artist: 'X',
  album: 'Y',
  no: 1,
  disc: 1,
  codec: '',
  folder,
  ...more
})

// /m
//   Rock        (no songs of its own)
//     A         a1 a2  (album with a cover)
//     B         b1
//   loose1 loose2
const folders: Folder[] = [
  { name: '/home/me/m', parent: -1 },
  { name: 'Rock', parent: 0 },
  { name: 'A', parent: 1 },
  { name: 'B', parent: 1 }
]
const tracks = [
  track('a1', 2, 'withCover'),
  track('a2', 2, 'withCover'),
  track('b1', 3),
  track('loose1', 0),
  track('loose2', 0)
]
const covers: Record<string, string> = { withCover: 'c.jpg' }
const tree = (): FolderTree => folderTree(folders, tracks, (id) => covers[id] ?? '')
const ids = (ts: Track[]): string[] => ts.map((t) => t.id)
const key = (t: FolderTree, i: number): string => t.nodes[i].key

describe('folderTree', () => {
  it('links folders to their subfolders and songs', () => {
    const t = tree()
    expect(t.roots).toEqual([0])
    expect(t.nodes[0].children).toEqual([1])
    expect(t.nodes[1].children).toEqual([2, 3])
    expect(ids(t.nodes[0].tracks)).toEqual(['loose1', 'loose2'])
    expect(ids(t.nodes[2].tracks)).toEqual(['a1', 'a2'])
  })

  it('counts the songs in a folder and all below it', () => {
    const t = tree()
    expect(t.nodes.map((n) => n.count)).toEqual([5, 3, 2, 1])
  })

  it('takes the cover of the first album inside that has one', () => {
    const t = tree()
    expect(t.nodes.map((n) => n.cover)).toEqual(['c.jpg', 'c.jpg', 'c.jpg', ''])
  })

  it('shows a music folder by its last part', () => {
    expect(tree().nodes[0].name).toBe('m')
    expect(rootName('/home/me/Music/')).toBe('Music')
    expect(rootName('C:\\Users\\me\\Music')).toBe('Music')
    expect(rootName('/')).toBe('/')
  })

  it('gives keys that tell a music folder from a subfolder of the same path', () => {
    const t = folderTree(
      [
        { name: '/m', parent: -1 },
        { name: 'rock', parent: 0 },
        { name: '/m/rock', parent: -1 }
      ],
      [track('x', 1), track('y', 2)],
      () => ''
    )
    expect(new Set(t.nodes.map((n) => n.key)).size).toBe(3)
  })

  it('skips a song with no folder', () => {
    const t = folderTree(folders, [track('x', -1), track('y', 9)], () => '')
    expect(t.nodes.map((n) => n.count)).toEqual([0, 0, 0, 0])
  })
})

describe('folderSongs', () => {
  it('plays subfolders first, in order, then the folder own songs', () => {
    const t = tree()
    expect(ids(folderSongs(t, 0))).toEqual(['a1', 'a2', 'b1', 'loose1', 'loose2'])
    expect(ids(folderSongs(t, 1))).toEqual(['a1', 'a2', 'b1'])
  })

  it('plays every music folder from the top', () => {
    const t = folderTree(
      [
        { name: '/a', parent: -1 },
        { name: '/b', parent: -1 }
      ],
      [track('x', 1), track('y', 0)],
      () => ''
    )
    expect(ids(folderSongs(t, null))).toEqual(['y', 'x'])
  })
})

describe('shownFolder', () => {
  const two = (): FolderTree =>
    folderTree(
      [
        { name: '/a', parent: -1 },
        { name: 'sub', parent: 0 },
        { name: '/b', parent: -1 }
      ],
      [track('x', 1), track('y', 2)],
      () => ''
    )

  it('opens the only music folder right away', () => {
    expect(shownFolder(tree(), null)).toBe(0)
  })

  it('lists the music folders when there are several', () => {
    expect(shownFolder(two(), null)).toBeNull()
  })

  it('finds a folder by its key', () => {
    const t = tree()
    expect(shownFolder(t, key(t, 2))).toBe(2)
  })

  it('shows the nearest folder above one a rescan removed', () => {
    const t = tree()
    expect(shownFolder(t, key(t, 2) + '\0gone\0deeper')).toBe(2)
    const t2 = two()
    expect(shownFolder(t2, key(t2, 2) + '\0gone')).toBe(2)
    expect(shownFolder(t2, '/c\0x')).toBeNull()
  })

  it('shows nothing when there are no folders', () => {
    const t = folderTree([], [], () => '')
    expect(shownFolder(t, null)).toBeNull()
  })
})

describe('crumbs', () => {
  it('lists the folders from the music folder down', () => {
    expect(crumbs(tree(), 2)).toEqual([0, 1, 2])
  })
})

describe('filterFolder', () => {
  it('keeps everything with no search', () => {
    const f = filterFolder(tree(), 0, '')
    expect(f.folders).toEqual([1])
    expect(ids(f.songs)).toEqual(['loose1', 'loose2'])
  })

  it('keeps subfolders by name and songs by title, artist or album', () => {
    const t = folderTree(
      folders,
      [
        track('Night Bus', 1),
        track('x', 1, 'al', { artist: 'Quiet Hours' }),
        track('y', 1, 'al', { album: 'Rain' }),
        track('a1', 2)
      ],
      () => ''
    )
    expect(filterFolder(t, 1, ' b ').folders).toEqual([3])
    expect(filterFolder(t, 1, 'bus').folders).toEqual([])
    expect(ids(filterFolder(t, 1, 'bus').songs)).toEqual(['Night Bus'])
    expect(ids(filterFolder(t, 1, 'quiet').songs)).toEqual(['x'])
    expect(ids(filterFolder(t, 1, 'RAIN').songs)).toEqual(['y'])
    // without accents (ticket 039)
    expect(ids(filterFolder(t, 1, 'bús').songs)).toEqual(['Night Bus'])
  })

  it('keeps a subfolder when a folder or song below it matches', () => {
    const t = tree()
    expect(filterFolder(t, 0, 'a1').folders).toEqual([1])
    expect(filterFolder(t, 1, 'a1').folders).toEqual([2])
    expect(filterFolder(t, 0, 'b').folders).toEqual([1])
    expect(filterFolder(t, 0, 'nothing').folders).toEqual([])
  })

  it('filters the music folders at the top by name', () => {
    const t = folderTree(
      [
        { name: '/x/Music', parent: -1 },
        { name: '/x/Audiobooks', parent: -1 }
      ],
      [track('a', 0), track('b', 1)],
      () => ''
    )
    expect(filterFolder(t, null, 'mus')).toEqual({ folders: [0], songs: [] })
    expect(filterFolder(t, null, 'b')).toEqual({ folders: [1], songs: [] })
  })
})

describe('folderPlaySongs', () => {
  const order = (t: Track): number => tracks.indexOf(t)

  it('plays the subfolders in folder order, then the songs in the shown sort', () => {
    const t = tree()
    expect(ids(folderPlaySongs(t, 0, '', null, order))).toEqual([
      'a1',
      'a2',
      'b1',
      'loose1',
      'loose2'
    ])
    expect(ids(folderPlaySongs(t, 0, '', { k: 't', dir: -1 }, order))).toEqual([
      'a1',
      'a2',
      'b1',
      'loose2',
      'loose1'
    ])
  })

  it('with a search, plays only what matches: the songs, and all of a folder whose name does', () => {
    const t = folderTree(
      folders,
      [
        track('Night Bus', 2),
        track('a2', 2),
        track('b1', 3),
        track('Bus Stop', 0),
        track('loose', 0)
      ],
      () => ''
    )
    // "Night Bus" is found in A; B plays in full, its name has a "b"
    expect(ids(folderPlaySongs(t, 0, 'bus', null, () => 0))).toEqual(['Night Bus', 'Bus Stop'])
    expect(ids(folderPlaySongs(t, 1, 'b', null, () => 0))).toEqual(['Night Bus', 'b1'])
  })

  it('plays every shown music folder from the top', () => {
    const t = folderTree(
      [
        { name: '/x/Music', parent: -1 },
        { name: '/x/Audiobooks', parent: -1 }
      ],
      [track('a', 0), track('b', 1)],
      () => ''
    )
    expect(ids(folderPlaySongs(t, null, '', null, () => 0))).toEqual(['a', 'b'])
    expect(ids(folderPlaySongs(t, null, 'audio', null, () => 0))).toEqual(['b'])
  })
})

describe('folderSearchText', () => {
  it('names the folder shown', () => {
    const t = tree()
    expect(folderSearchText(t, null)).toBe('Search this folder')
    expect(folderSearchText(t, key(t, 2))).toBe('Search this folder')
  })

  it('names the folders while they are listed, or when there are none', () => {
    const two = folderTree(
      [
        { name: '/a', parent: -1 },
        { name: '/b', parent: -1 }
      ],
      [track('x', 0), track('y', 1)],
      () => ''
    )
    expect(folderSearchText(two, null)).toBe('Search folders')
    expect(
      folderSearchText(
        folderTree([{ name: '/a', parent: -1 }], [], () => ''),
        null
      )
    ).toBe('Search folders')
  })
})

describe('commonFolder', () => {
  it('gives the one folder all songs are in', () => {
    expect(commonFolder(tree(), [2, 2])).toBe(2)
  })

  it('gives the folder above "CD1" and "CD2"', () => {
    expect(commonFolder(tree(), [2, 3])).toBe(1)
    expect(commonFolder(tree(), [3, 0])).toBe(0)
  })

  it('gives null for songs in no known folder, or in two music folders', () => {
    expect(commonFolder(tree(), [])).toBeNull()
    expect(commonFolder(tree(), [9])).toBeNull()
    const two = folderTree(
      [
        { name: '/a', parent: -1 },
        { name: '/b', parent: -1 }
      ],
      [],
      () => ''
    )
    expect(commonFolder(two, [0, 1])).toBeNull()
  })
})

describe('folderParts and folderPath', () => {
  it("starts from the music folder's full path", () => {
    expect(folderParts(tree(), 2)).toEqual(['/home/me/m', 'Rock', 'A'])
    expect(folderPath(['/home/me/m', 'Rock', 'A'])).toBe('/home/me/m/Rock/A')
  })

  it("joins with the music folder's own separator", () => {
    expect(folderPath(['C:\\Music', 'Rock'])).toBe('C:\\Music\\Rock')
    expect(folderPath(['C:\\Music\\', 'Rock'])).toBe('C:\\Music\\Rock')
    expect(folderPath(['/', 'Rock'])).toBe('/Rock')
  })
})
