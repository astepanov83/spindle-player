import { describe, expect, it } from 'vitest'
import {
  applyBatch,
  applyListing,
  emptiedFolders,
  emptyIndex,
  isUnder,
  missingPalettes,
  parseIndex,
  planReads,
  prunePalettes,
  serializeIndex,
  usedCovers
} from './merge'
import { fallbackPalettes, paletteVersion } from '../../shared/palette'
import { indexVersion, type FileEntry, type LibraryIndex } from './types'

const h1 = '1'.repeat(40)
const h2 = '2'.repeat(40)

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
    ix.palettes.set(h1, fallbackPalettes('a'))
    const back = parseIndex(JSON.parse(JSON.stringify(serializeIndex(ix))))
    expect(back).toEqual(ix)
  })

  it('reads an index from before palettes, keeping its files', () => {
    const ix = parseIndex({ version: indexVersion, files: [entry('/a.mp3')], images: [] })
    expect(ix.files.size).toBe(1)
    expect(ix.palettes.size).toBe(0)
  })

  it('drops palettes of another palette version, and broken ones', () => {
    const good = fallbackPalettes('a')
    const raw = { version: indexVersion, files: [entry('/a.mp3')], palettes: { [h1]: good } }
    expect(parseIndex({ ...raw, paletteVersion: paletteVersion + 1 }).palettes.size).toBe(0)
    expect(parseIndex({ ...raw, paletteVersion }).palettes.get(h1)).toEqual(good)
    const broken = parseIndex({
      ...raw,
      paletteVersion,
      palettes: { [h1]: { dark: good.dark }, [h2]: good, 'not-a-hash': good }
    })
    expect([...broken.palettes.keys()]).toEqual([h2])
    expect(broken.files.size).toBe(1)
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
    expect(planReads(known, found, (h) => h === 'here', false)).toEqual([
      '/m/touched.mp3',
      '/m/lost-cover.mp3',
      '/m/new.mp3'
    ])
  })
})

describe('planReads for failed files', () => {
  const failed = entry('/m/locked.mp3', { mtime: 1, size: 10, error: 'EACCES' })
  const fine = entry('/m/fine.mp3', { mtime: 1, size: 10 })
  const known = new Map([failed, fine].map((e) => [e.path, e]))
  const found = [
    { path: '/m/locked.mp3', mtime: 1, size: 10 },
    { path: '/m/fine.mp3', mtime: 1, size: 10 }
  ]

  it('reads a file that failed last time again on a Rescan, even if it did not change', () => {
    expect(planReads(known, found, () => true, true)).toEqual(['/m/locked.mp3'])
  })

  it('leaves it alone on the start-up scan', () => {
    expect(planReads(known, found, () => true, false)).toEqual([])
  })

  it('reads it on the start-up scan too once it changed', () => {
    const touched = [{ path: '/m/locked.mp3', mtime: 2, size: 10 }]
    expect(planReads(known, touched, () => true, false)).toEqual(['/m/locked.mp3'])
  })
})

describe('emptiedFolders', () => {
  it('finds a folder that had songs and now lists none, like an empty mount point', () => {
    const ix = indexOf([entry('/mnt/usb/a.mp3'), entry('/m/b.mp3')])
    expect(emptiedFolders(ix, ['/mnt/usb', '/m', '/new'], ['/m/b.mp3'])).toEqual(['/mnt/usb'])
    expect(emptiedFolders(ix, ['/mnt/usb', '/m'], ['/mnt/usb/c.mp3', '/m/b.mp3'])).toEqual([])
  })

  it('keeps the songs of that folder when used as unread', () => {
    const ix = indexOf([entry('/mnt/usb/a.mp3'), entry('/m/b.mp3'), entry('/m/c.mp3')])
    const folders = ['/mnt/usb', '/m']
    const paths = ['/m/b.mp3']
    const skipped = emptiedFolders(ix, folders, paths)
    applyListing(ix, folders, { paths, images: [], skipped })
    // the gone file in a folder that still lists files does leave
    expect([...ix.files.keys()]).toEqual(['/mnt/usb/a.mp3', '/m/b.mp3'])
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

  it('prunePalettes drops palettes of covers nothing uses', () => {
    const ix = indexOf([entry('/m/a.mp3', { cover: h1 })])
    ix.palettes.set(h1, fallbackPalettes('a'))
    ix.palettes.set(h2, fallbackPalettes('b'))
    expect(prunePalettes(ix, usedCovers(ix))).toBe(true)
    expect([...ix.palettes.keys()]).toEqual([h1])
    expect(prunePalettes(ix, usedCovers(ix))).toBe(false)
  })

  it('missingPalettes lists cached covers with no palette', () => {
    const h3 = '3'.repeat(40)
    const ix = indexOf([
      entry('/m/a.mp3', { cover: h1 }),
      entry('/m/b.mp3', { cover: h2 }),
      entry('/n/c.mp3', { cover: h3 })
    ])
    ix.palettes.set(h1, fallbackPalettes('a'))
    // h3 is not in the cache (bad or not made yet)
    expect(missingPalettes(ix, (h) => h !== h3)).toEqual([h2])
  })
})
