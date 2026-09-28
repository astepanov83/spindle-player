import { describe, expect, it } from 'vitest'
import { albumFolder, buildLibrary, shortHash, unknownArtist, variousArtists } from './group'
import { defaultPalettes, fallbackPalettes } from '../../shared/palette'
import { emptyIndex } from './merge'
import type { FileEntry, LibraryIndex } from './types'

const entry = (path: string, more: Partial<FileEntry> = {}): FileEntry => ({
  path,
  mtime: 1,
  size: 1,
  duration: 60,
  ...more
})

function build(
  files: FileEntry[],
  setup?: (ix: LibraryIndex) => void,
  has: (hash: string) => boolean = () => true
): ReturnType<typeof buildLibrary> {
  const ix = emptyIndex()
  for (const f of files) ix.files.set(f.path, f)
  setup?.(ix)
  return buildLibrary(ix, has)
}

describe('buildLibrary', () => {
  it('groups tagged tracks into albums, in disc and track order', () => {
    const { data } = build([
      entry('/m/nb/2.mp3', { album: 'Night Bus', artist: 'QH', title: 'Fog', track: 2 }),
      entry('/m/nb/1.mp3', { album: 'Night Bus', artist: 'QH', title: 'Route', track: 1 }),
      entry('/m/nb/d2.mp3', { album: 'Night Bus', artist: 'QH', title: 'Late', track: 1, disc: 2 })
    ])
    expect(data.albums).toHaveLength(1)
    const al = data.albums[0]
    expect(al.title).toBe('Night Bus')
    expect(al.artist).toBe('QH')
    expect(al.trackIds.map((id) => data.tracks.find((t) => t.id === id)?.title)).toEqual([
      'Route',
      'Fog',
      'Late'
    ])
    expect(data.tracks.map((t) => t.title)).toEqual(['Route', 'Fog', 'Late'])
  })

  it('keeps albums with the same name in different folders apart', () => {
    const { data } = build([
      entry('/m/a/1.mp3', { album: 'Greatest Hits', albumArtist: 'A' }),
      entry('/m/b/1.mp3', { album: 'Greatest Hits', albumArtist: 'A' })
    ])
    expect(data.albums).toHaveLength(2)
  })

  it('keeps two album artists apart in one folder', () => {
    const { data } = build([
      entry('/m/1.mp3', { album: 'Hits', albumArtist: 'A' }),
      entry('/m/2.mp3', { album: 'Hits', albumArtist: 'B' })
    ])
    expect(data.albums.map((a) => a.artist)).toEqual(['A', 'B'])
  })

  it('joins disc folders into one album', () => {
    const { data } = build([
      entry('/m/Album/CD1/1.mp3', { album: 'Album', artist: 'A', disc: 1 }),
      entry('/m/Album/CD2/1.mp3', { album: 'Album', artist: 'A', disc: 2 })
    ])
    expect(data.albums).toHaveLength(1)
    expect(data.albums[0].trackIds).toHaveLength(2)
  })

  it('calls an album with several artists and no album artist a compilation', () => {
    const { data } = build([
      entry('/m/mix/1.mp3', { album: 'Mix', artist: 'A' }),
      entry('/m/mix/2.mp3', { album: 'Mix', artist: 'B' })
    ])
    expect(data.albums).toHaveLength(1)
    expect(data.albums[0].artist).toBe(variousArtists)
    expect(data.tracks.map((t) => t.artist)).toEqual(['A', 'B'])
  })

  it('uses the file and folder names for files with no tags', () => {
    const { data } = build([
      entry('/m/Old Tapes/02 - Hiss.mp3', { duration: 0 }),
      entry('/m/Old Tapes/01 Side A.mp3', { error: 'bad header' })
    ])
    expect(data.albums).toHaveLength(1)
    expect(data.albums[0]).toMatchObject({ title: 'Old Tapes', artist: unknownArtist, year: 0 })
    expect(data.tracks.map((t) => [t.no, t.title, t.artist, t.album])).toEqual([
      [1, 'Side A', unknownArtist, 'Old Tapes'],
      [2, 'Hiss', unknownArtist, 'Old Tapes']
    ])
  })

  it('sorts albums by artist, year, then title', () => {
    const { data } = build([
      entry('/m/3.mp3', { album: 'Z', albumArtist: 'b', year: 2001 }),
      entry('/m/2.mp3', { album: 'Later', albumArtist: 'A', year: 2010 }),
      entry('/m/1.mp3', { album: 'Early', albumArtist: 'a', year: 1999 })
    ])
    expect(data.albums.map((a) => a.title)).toEqual(['Early', 'Later', 'Z'])
  })

  it('takes the most common year', () => {
    const { data } = build([
      entry('/m/1.mp3', { album: 'X', year: 2001 }),
      entry('/m/2.mp3', { album: 'X', year: 2003 }),
      entry('/m/3.mp3', { album: 'X', year: 2003 })
    ])
    expect(data.albums[0].year).toBe(2003)
  })

  it('picks the embedded cover first, then the folder image', () => {
    const withFolder = (ix: LibraryIndex): void => {
      ix.images.set('/m/a', { path: '/m/a/cover.jpg', mtime: 1, size: 1, cover: 'folder' })
    }
    const embedded = build(
      [entry('/m/a/1.mp3', { album: 'X' }), entry('/m/a/2.mp3', { album: 'X', cover: 'emb' })],
      withFolder
    )
    expect(embedded.data.albums[0].cover).toBe('spindle://cover/small/emb')
    expect(embedded.data.albums[0].coverLarge).toBe('spindle://cover/large/emb')

    const folder = build([entry('/m/a/1.mp3', { album: 'X' })], withFolder)
    expect(folder.data.albums[0].cover).toBe('spindle://cover/small/folder')

    const cached = build(
      [entry('/m/a/1.mp3', { album: 'X', cover: 'emb' })],
      withFolder,
      (h) => h !== 'emb'
    )
    expect(cached.data.albums[0].cover).toBe('spindle://cover/small/folder')

    expect(build([entry('/m/b/1.mp3')]).data.albums[0].cover).toBe('')
  })

  it("takes the cover's palette, an old version's until it is picked again, a neutral one with neither, and made-up colors with no cover", () => {
    const salt = fallbackPalettes('salt')
    const old = fallbackPalettes('old')
    const { data } = build(
      [
        entry('/m/a/1.mp3', { album: 'A', cover: 'withPalette' }),
        entry('/m/b/1.mp3', { album: 'B', cover: 'noPaletteYet' }),
        entry('/m/c/1.mp3', { album: 'C' }),
        entry('/m/d/1.mp3', { album: 'D', cover: 'oldPalette' })
      ],
      (ix) => {
        ix.palettes.set('withPalette', salt)
        ix.stalePalettes.set('oldPalette', old)
        // a new palette wins over the old one
        ix.stalePalettes.set('withPalette', old)
      }
    )
    const [a, b, c, d] = data.albums
    expect(d.palette).toEqual(old)
    expect(a.palette).toEqual(salt)
    expect(b.palette).toEqual(defaultPalettes)
    expect(c.palette).toEqual(fallbackPalettes(c.id))
    expect(c.palette).not.toEqual(defaultPalettes)
    // a copy, so the page's data never shares arrays with the index
    expect(a.palette.dark).not.toBe(salt.dark)
  })

  it('finds a folder image next to disc folders', () => {
    const { data } = build([entry('/m/Album/CD1/1.mp3', { album: 'A' })], (ix) => {
      ix.images.set('/m/Album', { path: '/m/Album/folder.jpg', mtime: 1, size: 1, cover: 'f' })
    })
    expect(data.albums[0].cover).toBe('spindle://cover/small/f')
  })

  it('gives stable ids and a path for each track', () => {
    const a = build([entry('/m/x/1.mp3', { album: 'X' })])
    const b = build([entry('/m/x/1.mp3', { album: 'X', title: 'New title' })])
    expect(a.data.tracks[0].id).toBe(shortHash('/m/x/1.mp3'))
    expect(b.data.tracks[0].id).toBe(a.data.tracks[0].id)
    expect(b.data.albums[0].id).toBe(a.data.albums[0].id)
    expect(a.paths.get(a.data.tracks[0].id)).toBe('/m/x/1.mp3')
  })
})

describe('albumFolder', () => {
  it('steps out of a disc folder only', () => {
    expect(albumFolder('/m/Album/Disc 2')).toBe('/m/Album')
    expect(albumFolder('/m/Album')).toBe('/m/Album')
  })
})

describe('disc folders without disc tags', () => {
  it('orders tracks by the disc folder, then the track number', () => {
    const { data } = build([
      entry('/m/Album/CD2/01.mp3', { album: 'Album', title: 'B1', track: 1 }),
      entry('/m/Album/CD1/02.mp3', { album: 'Album', title: 'A2', track: 2 }),
      entry('/m/Album/CD2/02.mp3', { album: 'Album', title: 'B2', track: 2 }),
      entry('/m/Album/CD1/01.mp3', { album: 'Album', title: 'A1', track: 1 })
    ])
    expect(data.albums).toHaveLength(1)
    expect(data.tracks.map((t) => [t.disc, t.no, t.title])).toEqual([
      [1, 1, 'A1'],
      [1, 2, 'A2'],
      [2, 1, 'B1'],
      [2, 2, 'B2']
    ])
  })

  it('does the same for files with no tags at all', () => {
    const { data } = build([
      entry('/m/Tapes/Disc 2/01 - Night.mp3'),
      entry('/m/Tapes/Disc 1/02 - Noon.mp3'),
      entry('/m/Tapes/Disc 1/01 - Dawn.mp3')
    ])
    expect(data.albums).toMatchObject([{ title: 'Tapes' }])
    expect(data.tracks.map((t) => [t.disc, t.no, t.title])).toEqual([
      [1, 1, 'Dawn'],
      [1, 2, 'Noon'],
      [2, 1, 'Night']
    ])
  })

  it('prefers the disc tag over the folder name', () => {
    const { data } = build([entry('/m/Album/CD1/01.mp3', { album: 'Album', disc: 3 })])
    expect(data.tracks[0].disc).toBe(3)
  })
})
