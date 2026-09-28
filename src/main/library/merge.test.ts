import { describe, expect, it } from 'vitest'
import {
  applyBatch,
  applyCue,
  applyListing,
  emptiedFolders,
  emptyIndex,
  isUnder,
  missingPalettes,
  parseIndex,
  planCueReads,
  planReads,
  prunePalettes,
  readAgain,
  serializeIndex,
  usedCovers
} from './merge'
import { fallbackPalettes, paletteVersion } from '../../shared/palette'
import type { Fetched } from './fetched-store'
import {
  cueReaderVersion,
  indexVersion,
  readerVersion,
  type FileEntry,
  type LibraryIndex
} from './types'

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
    ix.images.set('/m/b', {
      path: '/m/b/Scans/front.jpg',
      dir: '/m/b',
      mtime: 5,
      size: 6,
      cover: 'ghi'
    })
    ix.palettes.set(h1, fallbackPalettes('a'))
    ix.stalePalettes.set(h2, fallbackPalettes('b'))
    const back = parseIndex(JSON.parse(JSON.stringify(serializeIndex(ix))))
    expect(back).toEqual(ix)
  })

  it('reads an index from before palettes, keeping its files', () => {
    const ix = parseIndex({ version: indexVersion, files: [entry('/a.mp3')], images: [] })
    expect(ix.files.size).toBe(1)
    expect(ix.palettes.size).toBe(0)
  })

  it('keeps palettes of another palette version only as stand-ins, and drops broken ones', () => {
    const good = fallbackPalettes('a')
    const raw = { version: indexVersion, files: [entry('/a.mp3')], palettes: { [h1]: good } }
    const old = parseIndex({ ...raw, paletteVersion: paletteVersion - 1 })
    expect(old.palettes.size).toBe(0)
    expect(old.stalePalettes.get(h1)).toEqual(good)
    expect(parseIndex({ ...raw, paletteVersion }).palettes.get(h1)).toEqual(good)
    expect(parseIndex({ ...raw, paletteVersion }).stalePalettes.size).toBe(0)
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
    // from a scans folder: the cover of the folder above it
    const scan = { path: '/m/w/Scans/front.jpg', dir: '/m/w', mtime: 1, size: 1, cover: 'w' }
    applyListing(ix, ['/usb', '/m'], { paths: [], images: [im, scan], skipped: ['/usb'] })
    expect([...ix.images.keys()].sort()).toEqual(['/m/w', '/m/z', '/usb/x'])
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

  it('stand-ins stay until their cover is picked again, also across a save', () => {
    const ix = indexOf([entry('/m/a.mp3', { cover: h1 }), entry('/m/b.mp3', { cover: h2 })])
    ix.stalePalettes.set(h1, fallbackPalettes('old1'))
    ix.stalePalettes.set(h2, fallbackPalettes('old2'))
    ix.palettes.set(h1, fallbackPalettes('new1'))
    // not written once picked again
    const saved = serializeIndex(ix) as { stalePalettes: Record<string, unknown> }
    expect(Object.keys(saved.stalePalettes)).toEqual([h2])
    expect(parseIndex(JSON.parse(JSON.stringify(saved))).stalePalettes.get(h2)).toEqual(
      fallbackPalettes('old2')
    )
    // the cover still needs its new palette
    expect(missingPalettes(ix, () => true)).toEqual([h2])
    expect(prunePalettes(ix, usedCovers(ix))).toBe(true)
    expect([...ix.stalePalettes.keys()]).toEqual([h2])
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

describe('cue sheets in the index', () => {
  const sheet = {
    title: 'October Rust',
    year: 1996,
    files: ['CDImage.ape'],
    tracks: [
      { no: 1, file: 0, start: 0, title: 'Bad Ground' },
      { no: 2, file: 0, start: 38.4 }
    ]
  }

  it('reads back cues, the reader number and the decode format', () => {
    const ix = indexOf([entry('/m/i.ape', { sampleRate: 44100, channels: 2, bits: 16 })])
    ix.cues.set('/m/i.cue', { path: '/m/i.cue', mtime: 2, size: 3, sheet })
    ix.cues.set('/m/empty.cue', { path: '/m/empty.cue', mtime: 2, size: 3 })
    ix.reader = readerVersion
    const back = parseIndex(JSON.parse(JSON.stringify(serializeIndex(ix))))
    expect(back.cues).toEqual(ix.cues)
    expect(back.files).toEqual(ix.files)
    expect(back.reader).toBe(readerVersion)
  })

  it('starts an empty index at reader 1, so a scan with ffprobe reads old entries again', () => {
    expect(emptyIndex().reader).toBe(1)
    expect(parseIndex(undefined).reader).toBe(1)
    expect(parseIndex({ version: indexVersion + 1, reader: readerVersion }).reader).toBe(1)
    // saved by a first scan without ffprobe
    const back = parseIndex(JSON.parse(JSON.stringify(serializeIndex(emptyIndex()))))
    expect(back.reader).toBe(1)
  })

  it('takes an index with no reader number as reader 1, keeping its files', () => {
    const back = parseIndex({ version: indexVersion, files: [entry('/m/a.mp3')] })
    expect(back.reader).toBe(1)
    expect(back.files.size).toBe(1)
    expect(back.cues.size).toBe(0)
  })

  it('drops a broken sheet but keeps the cue, so it is not read again', () => {
    const back = parseIndex({
      version: indexVersion,
      cues: [
        {
          path: '/m/a.cue',
          mtime: 1,
          size: 1,
          sheet: { files: ['a'], tracks: [{ no: 1, file: 3, start: 0 }] }
        },
        { path: '/m/b.cue', mtime: 1, size: 1, sheet: { files: [1], tracks: [] } },
        { path: 5 }
      ]
    })
    expect([...back.cues.values()]).toEqual([
      { path: '/m/a.cue', mtime: 1, size: 1 },
      { path: '/m/b.cue', mtime: 1, size: 1 }
    ])
  })

  it('reads new and changed sheets only', () => {
    const known = new Map([
      ['/m/a.cue', { path: '/m/a.cue', mtime: 1, size: 5, reader: cueReaderVersion }]
    ])
    const found = [
      { path: '/m/a.cue', mtime: 1, size: 5 },
      { path: '/m/b.cue', mtime: 1, size: 5 },
      { path: '/m/a.cue', mtime: 2, size: 5 }
    ]
    expect(planCueReads(known, found)).toEqual(found.slice(1))
  })

  it('reads a sheet that gave nothing again on a Rescan only', () => {
    const known = new Map([
      ['/m/a.cue', { path: '/m/a.cue', mtime: 1, size: 5, reader: cueReaderVersion }]
    ])
    const found = [{ path: '/m/a.cue', mtime: 1, size: 5 }]
    expect(planCueReads(known, found)).toEqual([])
    expect(planCueReads(known, found, true)).toEqual(found)
  })

  it('reads again once a sheet an older cue reader made', () => {
    const found = [{ path: '/m/a.cue', mtime: 1, size: 5 }]
    const old = new Map([['/m/a.cue', { ...found[0], sheet: { files: [], tracks: [] } }]])
    expect(planCueReads(old, found)).toEqual(found)
    const now = new Map([['/m/a.cue', { ...old.get('/m/a.cue')!, reader: cueReaderVersion }]])
    expect(planCueReads(now, found)).toEqual([])
  })

  it('keeps the cue reader number in the index', () => {
    const ix = emptyIndex()
    ix.cues.set('/m/a.cue', { path: '/m/a.cue', mtime: 1, size: 1, reader: cueReaderVersion })
    const back = parseIndex(JSON.parse(JSON.stringify(serializeIndex(ix))))
    expect(back.cues.get('/m/a.cue')?.reader).toBe(cueReaderVersion)
  })

  it('drops sheets that are gone, keeping those under folders that could not be read', () => {
    const ix = emptyIndex()
    for (const p of ['/m/a/x.cue', '/m/b/y.cue', '/m/c/z.cue'])
      ix.cues.set(p, { path: p, mtime: 1, size: 1 })
    applyListing(ix, ['/m'], { paths: [], cues: ['/m/a/x.cue'], images: [], skipped: ['/m/b'] })
    expect([...ix.cues.keys()]).toEqual(['/m/a/x.cue', '/m/b/y.cue'])
  })

  it('reports a change of a sheet only when it differs', () => {
    const ix = emptyIndex()
    const c = { path: '/m/a.cue', mtime: 1, size: 1, sheet }
    expect(applyCue(ix, c)).toBe(true)
    expect(applyCue(ix, { ...c })).toBe(false)
    expect(applyCue(ix, { ...c, mtime: 2 })).toBe(true)
  })
})

describe('reading every file again for a new reader', () => {
  it('reads every file again once for reader 3', () => {
    const known = new Map([['/m/a.mp3', entry('/m/a.mp3', { title: 'A' })]])
    const found = [{ path: '/m/a.mp3', mtime: 1, size: 10 }]
    expect(planReads(known, found, () => true, false, readAgain(2))).toEqual(['/m/a.mp3'])
    expect(planReads(known, found, () => true, false, readAgain(3))).toEqual([])
  })

  it('keeps MusicBrainz ids through a save and load', () => {
    const ix = emptyIndex()
    const id = 'f5093c06-23e3-404f-aeaa-40f72885ee3a'
    ix.files.set('/m/a.mp3', entry('/m/a.mp3', { mbReleaseGroup: id, mbRelease: id }))
    const back = parseIndex(JSON.parse(JSON.stringify(serializeIndex(ix))))
    expect(back.files.get('/m/a.mp3')).toMatchObject({ mbReleaseGroup: id, mbRelease: id })
  })
})

describe('covers found online in the cache', () => {
  const h = 'f'.repeat(40)
  const f: Fetched = new Map([['al', { hash: h, source: 'itunes', at: 0, key: 'k' }]])

  it('counts them as used, so the prune keeps them', () => {
    expect(usedCovers(emptyIndex(), f).has(h)).toBe(true)
    expect(usedCovers(emptyIndex()).has(h)).toBe(false)
  })

  it('counts artist photos as used too', () => {
    const g = 'e'.repeat(40)
    const photos: Fetched = new Map([['queen', { hash: g, source: 'deezer', at: 0, key: 'q' }]])
    expect([...usedCovers(emptyIndex(), f, photos)].sort()).toEqual([g, h])
    expect(missingPalettes(emptyIndex(), () => true, f, photos).sort()).toEqual([g, h])
  })

  it('gives them palettes when they have none', () => {
    expect(missingPalettes(emptyIndex(), () => true, f)).toEqual([h])
  })
})
