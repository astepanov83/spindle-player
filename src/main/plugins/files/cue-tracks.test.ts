import { describe, expect, it } from 'vitest'
import type { CueSheet } from './cue'
import { cueTracks, resolveCueFile } from './cue-tracks'
import { buildLibrary } from './group'
import { shortHash } from '../../ids'
import { emptyIndex } from './merge'
import type { FileEntry, LibraryIndex } from './types'

const entry = (path: string, more: Partial<FileEntry> = {}): FileEntry => ({
  path,
  mtime: 1,
  size: 1,
  duration: 600,
  ...more
})

const sheet = (
  files: string[],
  starts: [number, number][],
  more: Partial<CueSheet> = {}
): CueSheet => ({
  files,
  tracks: starts.map(([file, start], i) => ({ no: i + 1, file, start, title: `T${i + 1}` })),
  ...more
})

function index(files: FileEntry[], cues: [string, CueSheet][]): LibraryIndex {
  const ix = emptyIndex()
  for (const f of files) ix.files.set(f.path, f)
  for (const [path, s] of cues) ix.cues.set(path, { path, mtime: 1, size: 1, sheet: s })
  return ix
}

describe('resolveCueFile', () => {
  const has =
    (...paths: string[]) =>
    (p: string): boolean =>
      paths.includes(p)

  it('takes the name as written', () => {
    expect(resolveCueFile('/m/a/x.cue', 'x.ape', ['/m/a/x.ape'], has('/m/a/x.ape'), true)).toBe(
      '/m/a/x.ape'
    )
  })

  it('takes a path under the folder, and Windows slashes', () => {
    expect(resolveCueFile('/m/a/x.cue', 'disc\\x.flac', [], has('/m/a/disc/x.flac'), true)).toBe(
      '/m/a/disc/x.flac'
    )
  })

  it("never takes a file outside the sheet's folder", () => {
    const other = has('/m/Other/x.flac', '/x.flac')
    expect(resolveCueFile('/m/a/x.cue', '../Other/x.flac', [], other, true)).toBeUndefined()
    expect(resolveCueFile('/m/a/x.cue', 'disc/../../Other/x.flac', [], other, true)).toBe(undefined)
    expect(resolveCueFile('/m/a/x.cue', '..\\..\\..\\x.flac', [], other, true)).toBe(undefined)
    // the usual fallbacks still look in its own folder
    expect(resolveCueFile('/m/a/x.cue', '../Other/x.flac', ['/m/a/X.flac'], other, false)).toBe(
      '/m/a/X.flac'
    )
    expect(resolveCueFile('/m/a/x.cue', '../Other/y.flac', ['/m/a/img.ape'], other, true)).toBe(
      '/m/a/img.ape'
    )
  })

  it('takes the same name in another case', () => {
    expect(resolveCueFile('/m/a/x.cue', 'CDIMAGE.APE', ['/m/a/CDImage.ape'], has(), true)).toBe(
      '/m/a/CDImage.ape'
    )
  })

  it('takes the same name with another extension (a .wav packed to .flac later)', () => {
    const dir = ['/m/a/Album.flac', '/m/a/other.mp3']
    expect(resolveCueFile('/m/a/x.cue', 'Album.wav', dir, has(), false)).toBe('/m/a/Album.flac')
  })

  it('takes the file named like the sheet, for "X.cue" and "X.ape.cue"', () => {
    const dir = ['/m/a/CDImage.ape', '/m/a/bonus.mp3']
    expect(resolveCueFile('/m/a/CDImage.ape.cue', 'Wrong.wav', dir, has(), true)).toBe(
      '/m/a/CDImage.ape'
    )
    expect(resolveCueFile('/m/a/CDImage.cue', 'Wrong.wav', dir, has(), true)).toBe(
      '/m/a/CDImage.ape'
    )
  })

  it('takes the only audio file in the folder', () => {
    expect(resolveCueFile('/m/a/x.cue', 'gone.wav', ['/m/a/img.ape'], has(), true)).toBe(
      '/m/a/img.ape'
    )
  })

  it('guesses nothing when there is more than one choice', () => {
    const dir = ['/m/a/1.flac', '/m/a/2.flac']
    expect(resolveCueFile('/m/a/x.cue', 'gone.wav', dir, has(), true)).toBeUndefined()
    // a sheet with several FILE lines gets no folder-wide guess
    expect(resolveCueFile('/m/a/x.cue', 'gone.wav', ['/m/a/1.flac'], has(), false)).toBe(undefined)
  })
})

describe('cueTracks', () => {
  it('gives each track its gains from the sheet, then the image (ticket 090)', () => {
    const img = '/m/a/img.flac'
    const s = sheet(
      ['img.flac'],
      [
        [0, 0],
        [0, 100]
      ]
    )
    s.gain = { album: -6 }
    s.tracks[0].gain = { track: -4, trackPeak: 0.7 }
    const ix = index([entry(img, { gain: { track: -8, trackPeak: 0.9 } })], [['/m/a/img.cue', s]])
    expect(cueTracks(ix).items.map((i) => i.entry.gain)).toEqual([
      { track: -4, trackPeak: 0.7, album: -6, albumPeak: 0.9 },
      { album: -6, albumPeak: 0.9 }
    ])
    // and the page's songs carry them
    const lib = buildLibrary(ix, () => true).data
    expect(lib.tracks.map((t) => t.gain?.album)).toEqual([-6, -6])
  })

  it('gives each track the image’s sample rate, and the page’s songs carry it (ticket 091)', () => {
    const img = '/m/a/img.flac'
    const s = sheet(
      ['img.flac'],
      [
        [0, 0],
        [0, 100]
      ]
    )
    const ix = index([entry(img, { sampleRate: 96000 })], [['/m/a/img.cue', s]])
    expect(cueTracks(ix).items.map((i) => i.entry.sampleRate)).toEqual([96000, 96000])
    const lib = buildLibrary(ix, () => true).data
    expect(lib.tracks.map((t) => t.rate)).toEqual([96000, 96000])
  })

  it('splits an image into tracks with starts, ends and lengths', () => {
    const img = '/m/tone/CDImage.ape'
    const ix = index(
      [entry(img, { duration: 400, codec: "Monkey's Audio", added: 42 })],
      [
        [
          '/m/tone/CDImage.ape.cue',
          sheet(
            ['CDImage.ape'],
            [
              [0, 0],
              [0, 100.5],
              [0, 250]
            ]
          )
        ]
      ]
    )
    const { items, images } = cueTracks(ix)
    expect([...images]).toEqual([img])
    const file = shortHash(img)
    expect(items.map((i) => i.part)).toEqual([
      { file, start: 0, end: 100.5 },
      { file, start: 100.5, end: 250 },
      { file, start: 250 }
    ])
    expect(items.map((i) => i.entry.duration)).toEqual([100.5, 149.5, 150])
    expect(items.map((i) => i.id)).toEqual([1, 2, 3].map((n) => shortHash(`${img}#${n}`)))
    expect(items[0].entry.codec).toBe("Monkey's Audio")
    // the image's time added, for the album's
    expect(items.map((i) => i.entry.added)).toEqual([42, 42, 42])
  })

  it('takes album tags from the sheet, then from the image', () => {
    const img = '/m/a/img.flac'
    const image = entry(img, {
      album: 'Tag Album',
      albumArtist: 'Tag Artist',
      artist: 'Tag Artist',
      year: 2001,
      genre: 'Rock',
      disc: 2,
      cover: 'c'.repeat(40)
    })
    const withSheet = cueTracks(
      index(
        [image],
        [
          [
            '/m/a/img.cue',
            sheet(['img.flac'], [[0, 0]], {
              title: 'Cue Album',
              performer: 'Cue Artist',
              year: 1999
            })
          ]
        ]
      )
    ).items[0].entry
    expect(withSheet).toMatchObject({
      album: 'Cue Album',
      albumArtist: 'Cue Artist',
      artist: 'Cue Artist',
      year: 1999,
      genre: 'Rock',
      disc: 2,
      cover: 'c'.repeat(40),
      title: 'T1',
      track: 1
    })
    const bare = cueTracks(index([image], [['/m/a/img.cue', sheet(['img.flac'], [[0, 5]])]]))
      .items[0].entry
    expect(bare).toMatchObject({ album: 'Tag Album', albumArtist: 'Tag Artist', year: 2001 })
  })

  it('names a track with no TITLE by its number', () => {
    const ix = index(
      [entry('/m/a/i.ape')],
      [
        [
          '/m/a/i.cue',
          {
            files: ['i.ape'],
            tracks: [
              { no: 1, file: 0, start: 0 },
              { no: 2, file: 0, start: 9 }
            ]
          }
        ]
      ]
    )
    expect(cueTracks(ix).items.map((i) => i.entry.title)).toEqual(['Track 01', 'Track 02'])
  })

  it('keeps the plain id for a file that is one whole track (a sheet over split files)', () => {
    const ix = index(
      [entry('/m/a/01.flac'), entry('/m/a/02.flac')],
      [
        [
          '/m/a/x.cue',
          sheet(
            ['01.flac', '02.flac'],
            [
              [0, 0],
              [1, 0]
            ]
          )
        ]
      ]
    )
    const { items } = cueTracks(ix)
    expect(items.map((i) => i.id)).toEqual([shortHash('/m/a/01.flac'), shortHash('/m/a/02.flac')])
    expect(items.map((i) => i.part)).toEqual([undefined, undefined])
    expect(items.map((i) => i.entry.title)).toEqual(['T1', 'T2'])
  })

  it('takes one track per file as the whole file, also after a pregap', () => {
    const ix = index(
      [
        entry('/m/a/01.flac', { duration: 200 }),
        entry('/m/a/02.flac', { duration: 180, title: 'Own Title' })
      ],
      [
        [
          '/m/a/x.cue',
          {
            files: ['01.flac', '02.flac'],
            tracks: [
              { no: 1, file: 0, start: 2, title: 'One' },
              { no: 2, file: 1, start: 1.5 }
            ]
          }
        ]
      ]
    )
    const { items } = cueTracks(ix)
    expect(items.map((i) => i.id)).toEqual([shortHash('/m/a/01.flac'), shortHash('/m/a/02.flac')])
    expect(items.map((i) => i.part)).toEqual([undefined, undefined])
    expect(items.map((i) => i.entry.duration)).toEqual([200, 180])
    // no TITLE in the sheet: the file's own title before "Track 02"
    expect(items.map((i) => i.entry.title)).toEqual(['One', 'Own Title'])
  })

  it('names a stretch of an image with no TITLE by its number, not by the image title', () => {
    const ix = index(
      [entry('/m/a/i.ape', { title: 'Whole Album' })],
      [
        [
          '/m/a/i.cue',
          {
            files: ['i.ape'],
            tracks: [
              { no: 1, file: 0, start: 0 },
              { no: 2, file: 0, start: 9 }
            ]
          }
        ]
      ]
    )
    expect(cueTracks(ix).items.map((i) => i.entry.title)).toEqual(['Track 01', 'Track 02'])
  })

  it('ends the last track of each file at that file’s end', () => {
    const ix = index(
      [entry('/m/a/1.flac', { duration: 300 }), entry('/m/a/2.flac', { duration: 200 })],
      [
        [
          '/m/a/x.cue',
          sheet(
            ['1.flac', '2.flac'],
            [
              [0, 0],
              [0, 100],
              [1, 0],
              [1, 50]
            ]
          )
        ]
      ]
    )
    const { items } = cueTracks(ix)
    expect(items.map((i) => [i.part?.start, i.part?.end, i.entry.duration])).toEqual([
      [0, 100, 100],
      [100, undefined, 200],
      [0, 50, 50],
      [50, undefined, 150]
    ])
  })

  it('leaves out a sheet whose tracks start past the end of the file', () => {
    const ix = index(
      [entry('/m/a/bonus.mp3', { duration: 200 })],
      [
        [
          '/m/a/gone.cue',
          sheet(
            ['gone.flac'],
            [
              [0, 0],
              [0, 300]
            ]
          )
        ]
      ]
    )
    expect(cueTracks(ix).items).toEqual([])
  })

  it('lets the first sheet by path win when two name the same image', () => {
    const img = '/m/a/i.flac'
    const ix = index(
      [entry(img)],
      [
        ['/m/a/b.cue', sheet(['i.flac'], [[0, 0]], { title: 'B' })],
        ['/m/a/a.cue', sheet(['i.flac'], [[0, 5]], { title: 'A' })]
      ]
    )
    const { items } = cueTracks(ix)
    expect(items.map((i) => i.entry.album)).toEqual(['A'])
  })

  it('leaves a song in another folder alone for a sheet that names it with ../', () => {
    const ix = index(
      [entry('/m/b/x.flac', { duration: 300 }), entry('/m/a/notes.mp3')],
      [
        [
          '/m/a/a.cue',
          sheet(
            ['../b/x.flac', 'y.flac'],
            [
              [0, 0],
              [0, 60]
            ]
          )
        ]
      ]
    )
    expect(cueTracks(ix)).toEqual({ items: [], images: new Set() })
  })

  it('does nothing for a sheet whose file is not there', () => {
    const ix = index(
      [entry('/m/a/1.flac'), entry('/m/a/2.flac')],
      [['/m/a/x.cue', sheet(['gone.wav'], [[0, 0]])]]
    )
    expect(cueTracks(ix)).toEqual({ items: [], images: new Set() })
  })
})

describe('buildLibrary with cue sheets', () => {
  const img = '/m/Type O Negative 1996 October Rust/CDImage.ape'
  const ix = (): LibraryIndex =>
    index(
      [entry(img, { duration: 4378.33, container: "Monkey's Audio" }), entry('/m/other/a.mp3')],
      [
        [
          '/m/Type O Negative 1996 October Rust/CDImage.ape.cue',
          sheet(
            ['CDImage.ape'],
            [
              [0, 0],
              [0, 38.4]
            ],
            { title: 'October Rust', performer: 'Type O Negative' }
          )
        ]
      ]
    )

  it('lists the cue tracks as an album and not the image', () => {
    const { data, paths } = buildLibrary(ix(), () => true)
    const al = data.albums.find((a) => a.title === 'October Rust')!
    expect(al.artist).toBe('Type O Negative')
    const tracks = al.trackIds.map((id) => data.tracks.find((t) => t.id === id)!)
    expect(tracks.map((t) => [t.no, t.title, t.duration])).toEqual([
      [1, 'T1', 38.4],
      [2, 'T2', 4339.93]
    ])
    expect(tracks[0].part).toEqual({ file: shortHash(img), start: 0, end: 38.4 })
    expect(data.tracks.some((t) => t.id === shortHash(img))).toBe(false)
    // the page plays the tracks by the image's id
    expect(paths.get(shortHash(img))).toBe(img)
  })

  it('gives the same ids on every build', () => {
    const a = buildLibrary(ix(), () => true).data.tracks.map((t) => t.id)
    const b = buildLibrary(ix(), () => true).data.tracks.map((t) => t.id)
    expect(a).toEqual(b)
  })

  it('puts cue tracks in the folder of the sheet, not of the image', () => {
    const i = index(
      [entry('/m/a/disc/img.flac', { duration: 100 })],
      [
        [
          '/m/a/a.cue',
          sheet(
            ['disc/img.flac'],
            [
              [0, 0],
              [0, 50]
            ]
          )
        ]
      ]
    )
    const { data } = buildLibrary(i, () => true, undefined, ['/m'])
    expect(data.folders).toEqual([
      { name: '/m', parent: -1 },
      { name: 'a', parent: 0 }
    ])
    expect(data.tracks.map((t) => t.folder)).toEqual([1, 1])
  })

  it('lists the image as one song again when the sheet is gone', () => {
    const i = ix()
    i.cues.clear()
    const { data } = buildLibrary(i, () => true)
    expect(data.tracks.some((t) => t.id === shortHash(img))).toBe(true)
  })
})
