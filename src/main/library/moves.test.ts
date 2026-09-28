import { describe, expect, it } from 'vitest'
import type { CueSheet } from './cue'
import { buildLibrary } from './group'
import { shortHash } from './ids'
import { emptyIndex } from './merge'
import { fileKey, findMoves, idMoves, moveEntries, movePlan } from './moves'
import type { FileEntry, LibraryIndex } from './types'

const entry = (path: string, more: Partial<FileEntry> = {}): FileEntry => ({
  path,
  mtime: 1,
  size: 1,
  duration: 600,
  ...more
})

const sheet: CueSheet = {
  files: ['image.flac'],
  tracks: [
    { no: 1, file: 0, start: 0, title: 'One' },
    { no: 2, file: 0, start: 200, title: 'Two' },
    { no: 3, file: 0, start: 400, title: 'Three' }
  ],
  title: 'Disc'
}

// A folder reached by a symlink (/m/link) whose real path (/m/real) now wins.
function index(): LibraryIndex {
  const ix = emptyIndex()
  ix.files.set('/m/link/01.flac', entry('/m/link/01.flac', { title: 'Song', album: 'A' }))
  ix.files.set('/m/link/image.flac', entry('/m/link/image.flac'))
  ix.files.set('/m/other/02.flac', entry('/m/other/02.flac', { title: 'Other' }))
  ix.cues.set('/m/link/image.cue', { path: '/m/link/image.cue', mtime: 1, size: 1, sheet })
  return ix
}

const moves = new Map([
  ['/m/link/01.flac', '/m/real/01.flac'],
  ['/m/link/image.flac', '/m/real/image.flac'],
  ['/m/link/image.cue', '/m/real/image.cue']
])

const ids = (ix: LibraryIndex): string[] =>
  buildLibrary(ix, () => false)
    .data.tracks.map((t) => t.id)
    .sort()

describe('fileKey', () => {
  it('is device and inode, and none without an inode', () => {
    expect(fileKey({ dev: 5n, ino: 42n })).toBe('5:42')
    expect(fileKey({ dev: 5n, ino: 0n })).toBeUndefined()
  })

  it('keeps an inode past 2^53 exact', () => {
    const a = fileKey({ dev: 1n, ino: 2n ** 60n + 1n })
    const b = fileKey({ dev: 1n, ino: 2n ** 60n })
    expect(a).not.toBe(b)
  })
})

describe('movePlan', () => {
  const folders = ['/m', '/usb']
  const ixWith = (...paths: string[]): LibraryIndex => {
    const ix = emptyIndex()
    for (const p of paths)
      if (p.endsWith('.cue')) ix.cues.set(p, { path: p, mtime: 1, size: 1 })
      else ix.files.set(p, entry(p))
    return ix
  }

  it('takes new paths with a key, and paths gone from the music folders', () => {
    const ix = ixWith('/m/link/a.flac', '/m/link/a.cue', '/m/kept.flac')
    const plan = movePlan(
      ix,
      [
        { path: '/m/real/a.flac', key: '1:1' },
        { path: '/m/real/a.cue', key: '1:2' },
        { path: '/m/kept.flac', key: '1:3' },
        // no key: can't be matched
        { path: '/m/real/b.flac' }
      ],
      folders,
      []
    )
    expect(plan.added).toEqual(
      new Map([
        ['/m/real/a.flac', '1:1'],
        ['/m/real/a.cue', '1:2']
      ])
    )
    // cue sheets count too
    expect(plan.gone.sort()).toEqual(['/m/link/a.cue', '/m/link/a.flac'])
  })

  it('leaves out folders that could not be read, and paths outside the folders', () => {
    const ix = ixWith('/usb/x.flac', '/m/gone/y.flac', '/old/z.flac', '/m/z.flac')
    // /usb is unplugged; /m/gone could not be read; /old is no music folder any more
    const plan = movePlan(ix, [{ path: '/m/new.flac', key: '1:9' }], folders, ['/usb', '/m/gone'])
    expect(plan.gone).toEqual(['/m/z.flac'])
  })

  it('asks for no stat when nothing was added', () => {
    const ix = ixWith('/m/a.flac', '/m/b.flac')
    const plan = movePlan(ix, [{ path: '/m/a.flac', key: '1:1' }], folders, [])
    expect(plan.added.size).toBe(0)
    expect(plan.gone).toEqual([])
  })

  it('asks for no stat when nothing is gone', () => {
    const ix = ixWith('/m/a.flac')
    const plan = movePlan(
      ix,
      [
        { path: '/m/a.flac', key: '1:1' },
        { path: '/m/new.flac', key: '1:2' }
      ],
      folders,
      []
    )
    expect(plan.added.size).toBe(0)
    expect(plan.gone).toEqual([])
  })
})

describe('findMoves', () => {
  it('pairs a path that left with a new path of the same file', () => {
    const gone = new Map([
      ['/m/link/a.flac', '1:10'],
      ['/m/deleted.flac', '1:11']
    ])
    const added = new Map([
      ['/m/real/a.flac', '1:10'],
      ['/m/new.flac', '1:12']
    ])
    expect(findMoves(gone, added)).toEqual(new Map([['/m/link/a.flac', '/m/real/a.flac']]))
  })

  it('leaves out a file that two new paths reach', () => {
    const gone = new Map([['/m/old.flac', '1:10']])
    const added = new Map([
      ['/m/a.flac', '1:10'],
      ['/m/b.flac', '1:10']
    ])
    expect(findMoves(gone, added).size).toBe(0)
  })

  it('does not take the same key on another device', () => {
    expect(findMoves(new Map([['/a', '1:10']]), new Map([['/b', '2:10']])).size).toBe(0)
  })
})

describe('idMoves', () => {
  it('maps every old id to the id the new path gives', () => {
    const ix = index()
    const before = ids(ix)
    const map = idMoves(ix, moves)
    moveEntries(ix, moves)
    const after = ids(ix)
    // every song that moved: the plain song and the three cue tracks
    expect(
      Object.keys(map)
        .filter((id) => before.includes(id))
        .sort()
    ).toEqual(before.filter((id) => !after.includes(id)).sort())
    // and each lands on an id the library has now
    for (const [from, to] of Object.entries(map)) {
      if (!before.includes(from)) continue
      expect(after).toContain(to)
    }
    // the song that did not move keeps its id and is not in the map
    expect(map[shortHash('/m/other/02.flac')]).toBeUndefined()
    expect(after).toContain(shortHash('/m/other/02.flac'))
  })

  it("maps the disc image's own id too, which the page plays its tracks by", () => {
    const map = idMoves(index(), moves)
    expect(map[shortHash('/m/link/image.flac')]).toBe(shortHash('/m/real/image.flac'))
  })

  it('maps a sheet over one whole file by the file id', () => {
    const ix = emptyIndex()
    ix.files.set('/m/link/a.flac', entry('/m/link/a.flac'))
    const one: CueSheet = { files: ['a.flac'], tracks: [{ no: 1, file: 0, start: 0 }] }
    ix.cues.set('/m/link/a.cue', { path: '/m/link/a.cue', mtime: 1, size: 1, sheet: one })
    const m = new Map([
      ['/m/link/a.flac', '/m/real/a.flac'],
      ['/m/link/a.cue', '/m/real/a.cue']
    ])
    expect(idMoves(ix, m)).toEqual({ [shortHash('/m/link/a.flac')]: shortHash('/m/real/a.flac') })
  })
})

describe('moveEntries', () => {
  it('moves files and cue sheets with what was read', () => {
    const ix = index()
    moveEntries(ix, moves)
    expect(ix.files.get('/m/real/01.flac')).toEqual(
      entry('/m/real/01.flac', { title: 'Song', album: 'A' })
    )
    expect(ix.files.has('/m/link/01.flac')).toBe(false)
    expect(ix.cues.get('/m/real/image.cue')?.sheet).toEqual(sheet)
    expect([...ix.files.keys()].sort()).toEqual(
      ['/m/other/02.flac', '/m/real/01.flac', '/m/real/image.flac'].sort()
    )
  })

  it('never replaces an entry already at the new path', () => {
    const ix = emptyIndex()
    ix.files.set('/a', entry('/a', { title: 'old' }))
    ix.files.set('/b', entry('/b', { title: 'there' }))
    moveEntries(ix, new Map([['/a', '/b']]))
    expect(ix.files.get('/b')?.title).toBe('there')
  })
})
