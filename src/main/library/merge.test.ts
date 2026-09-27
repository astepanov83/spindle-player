import { describe, expect, it } from 'vitest'
import {
  applyBatch,
  applyListing,
  emptyIndex,
  isUnder,
  parseIndex,
  planReads,
  serializeIndex,
  usedCovers
} from './merge'
import { indexVersion, type FileEntry, type LibraryIndex } from './types'

const entry = (path: string, more: Partial<FileEntry> = {}): FileEntry => ({
  path,
  mtime: 1,
  size: 10,
  duration: 100,
  ...more
})

function indexOf(files: FileEntry[]): LibraryIndex {
  const ix = emptyIndex()
  for (const f of files) ix.files.set(f.path, f)
  return ix
}

describe('parseIndex', () => {
  it('reads back what serializeIndex wrote', () => {
    const ix = indexOf([entry('/m/a.mp3', { title: 'A', track: 2, cover: 'abc' })])
    ix.images.set('/m', { path: '/m/cover.jpg', mtime: 5, size: 6, cover: 'def' })
    const back = parseIndex(JSON.parse(JSON.stringify(serializeIndex(ix))))
    expect(back).toEqual(ix)
  })

  it('starts empty for another version or junk', () => {
    expect(parseIndex({ version: indexVersion + 1, files: [entry('/a.mp3')] }).files.size).toBe(0)
    expect(parseIndex('nope').files.size).toBe(0)
  })

  it('drops broken entries and broken fields', () => {
    const ix = parseIndex({
      version: indexVersion,
      files: [
        { path: '/a.mp3', mtime: 1 },
        { path: '/b.mp3', mtime: 1, size: 2, title: 7, track: -1, duration: 'x', year: 2001 }
      ]
    })
    expect([...ix.files.values()]).toEqual([
      { path: '/b.mp3', mtime: 1, size: 2, duration: 0, year: 2001 }
    ])
  })
})

describe('planReads', () => {
  const known = new Map<string, FileEntry>(
    [
      entry('/m/same.mp3', { mtime: 1, size: 10 }),
      entry('/m/touched.mp3', { mtime: 1, size: 10 }),
      entry('/m/lost-cover.mp3', { mtime: 1, size: 10, cover: 'gone' }),
      entry('/m/has-cover.mp3', { mtime: 1, size: 10, cover: 'here' })
    ].map((e) => [e.path, e])
  )
  it('reads new files, changed files and files whose cover left the cache', () => {
    const found = [
      { path: '/m/same.mp3', mtime: 1, size: 10 },
      { path: '/m/touched.mp3', mtime: 2, size: 10 },
      { path: '/m/lost-cover.mp3', mtime: 1, size: 10 },
      { path: '/m/has-cover.mp3', mtime: 1, size: 10 },
      { path: '/m/new.mp3', mtime: 1, size: 10 }
    ]
    expect(planReads(known, found, (h) => h === 'here')).toEqual([
      '/m/touched.mp3',
      '/m/lost-cover.mp3',
      '/m/new.mp3'
    ])
  })
})

describe('planReads for failed files', () => {
  it('reads a file that failed last time again, even if it did not change', () => {
    const failed = entry('/m/locked.mp3', { mtime: 1, size: 10, error: 'EACCES' })
    const fine = entry('/m/fine.mp3', { mtime: 1, size: 10 })
    const known = new Map([failed, fine].map((e) => [e.path, e]))
    const found = [
      { path: '/m/locked.mp3', mtime: 1, size: 10 },
      { path: '/m/fine.mp3', mtime: 1, size: 10 }
    ]
    expect(planReads(known, found, () => true)).toEqual(['/m/locked.mp3'])
  })
})

describe('applyListing', () => {
  it('drops files that are gone, and files outside the folders', () => {
    const ix = indexOf([entry('/m/a.mp3'), entry('/m/b.mp3'), entry('/old/c.mp3')])
    const changed = applyListing(ix, ['/m'], { paths: ['/m/a.mp3'], images: [], skipped: [] })
    expect(changed).toBe(true)
    expect([...ix.files.keys()]).toEqual(['/m/a.mp3'])
  })

  it('keeps files under a folder that could not be read', () => {
    const ix = indexOf([entry('/usb/a.mp3'), entry('/m/b.mp3')])
    const changed = applyListing(ix, ['/usb', '/m'], {
      paths: ['/m/b.mp3'],
      images: [],
      skipped: ['/usb']
    })
    expect(changed).toBe(false)
    expect(ix.files.size).toBe(2)
  })

  it('replaces folder images, keeping those under unread folders', () => {
    const ix = emptyIndex()
    ix.images.set('/usb/x', { path: '/usb/x/cover.jpg', mtime: 1, size: 1, cover: 'u' })
    ix.images.set('/m/y', { path: '/m/y/cover.jpg', mtime: 1, size: 1, cover: 'y' })
    const im = { path: '/m/z/folder.jpg', mtime: 1, size: 1, cover: 'z' }
    applyListing(ix, ['/usb', '/m'], { paths: [], images: [im], skipped: ['/usb'] })
    expect([...ix.images.keys()].sort()).toEqual(['/m/z', '/usb/x'])
  })

  it('reports no change for the same listing', () => {
    const ix = indexOf([entry('/m/a.mp3')])
    const im = { path: '/m/cover.jpg', mtime: 1, size: 1, cover: 'c' }
    applyListing(ix, ['/m'], { paths: ['/m/a.mp3'], images: [im], skipped: [] })
    expect(applyListing(ix, ['/m'], { paths: ['/m/a.mp3'], images: [im], skipped: [] })).toBe(false)
  })
})

describe('applyBatch', () => {
  it('adds and replaces entries, and reports a change only if one differs', () => {
    const ix = indexOf([entry('/m/a.mp3', { title: 'A' })])
    expect(applyBatch(ix, [entry('/m/a.mp3', { title: 'A' })])).toBe(false)
    expect(applyBatch(ix, [entry('/m/a.mp3', { title: 'A2' }), entry('/m/b.mp3')])).toBe(true)
    expect(ix.files.get('/m/a.mp3')?.title).toBe('A2')
    expect(ix.files.size).toBe(2)
  })
})

describe('helpers', () => {
  it('isUnder matches whole folder names only', () => {
    expect(isUnder('/m/a.mp3', '/m')).toBe(true)
    expect(isUnder('/music/a.mp3', '/m')).toBe(false)
    expect(isUnder('/a.mp3', '/')).toBe(true)
  })

  it('usedCovers lists file and folder covers', () => {
    const ix = indexOf([entry('/m/a.mp3', { cover: 'a' }), entry('/m/b.mp3')])
    ix.images.set('/m', { path: '/m/cover.jpg', mtime: 1, size: 1, cover: 'f' })
    expect([...usedCovers(ix)].sort()).toEqual(['a', 'f'])
  })
})
