import { describe, expect, it } from 'vitest'
import {
  addedOf,
  albumFolder,
  buildLibrary,
  shortHash,
  unknownArtist,
  variousArtists
} from './group'
import { defaultPalettes, fallbackPalettes } from '../../../shared/palette'
import { emptyIndex } from './merge'
import type { FileEntry, LibraryIndex } from './types'
import { cleanArtist } from '../../covers/clean-names'
import { searchKey } from './cover-match'
import { artistKey } from '../../../shared/plugins/files/artists'
import { convertOld, resolve } from '../../../shared/plugins/files/artists-file'
import type { Fetched } from './fetched-store'
import type { LibraryData } from '../../../shared/library'
import {
  applyPatch,
  diffLibrary,
  type HeldLibrary,
  type PatchBody
} from '../../../shared/plugins/files/library-patch'

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
  has: (hash: string) => boolean = () => true,
  fetched?: Fetched,
  photos?: Fetched,
  overrides?: Record<string, string[]>,
  groups?: Record<string, string>
): ReturnType<typeof buildLibrary> {
  const ix = emptyIndex()
  for (const f of files) ix.files.set(f.path, f)
  setup?.(ix)
  // artists.json as the old files would make it: overrides as your links,
  // groups as the AI's, with the AI on
  const tags = files.flatMap((f) => [f.artist, f.albumArtist]).filter((t) => t !== undefined)
  const spelling = (key: string): string | undefined => tags.find((t) => artistKey(t) === key)
  const old = { groups: new Map(Object.entries(groups ?? {})), asked: new Set<string>() }
  const f = convertOld(new Map(Object.entries(overrides ?? {})), old, spelling).artists
  return buildLibrary(ix, has, fetched, [], photos, resolve(f, true))
}

describe('addedOf', () => {
  it('takes the earliest song, and the mtime of an entry from an older index', () => {
    expect(addedOf([entry('/a', { added: 50 }), entry('/b', { added: 20 })])).toBe(20)
    expect(addedOf([entry('/a', { added: 50, mtime: 9 }), entry('/b', { mtime: 30 })])).toBe(30)
    expect(addedOf([])).toBe(0)
  })
})

describe('buildLibrary', () => {
  it('gives each album when its first song was added (085)', () => {
    const { data } = build([
      entry('/m/nb/1.mp3', { album: 'Night Bus', artist: 'QH', added: 300 }),
      entry('/m/nb/2.mp3', { album: 'Night Bus', artist: 'QH', added: 100 })
    ])
    expect(data.albums[0].added).toBe(100)
  })

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

  it("gives a song its own picture and colors only when it differs from the album's", () => {
    const salt = fallbackPalettes('salt')
    const { data } = build(
      [
        entry('/m/mix/1.mp3', { album: 'Mix', track: 1, cover: 'one' }),
        entry('/m/mix/2.mp3', { album: 'Mix', track: 2, cover: 'two' }),
        entry('/m/mix/3.mp3', { album: 'Mix', track: 3 }),
        entry('/m/mix/4.mp3', { album: 'Mix', track: 4, cover: 'gone' })
      ],
      (ix) => ix.palettes.set('two', salt),
      (h) => h !== 'gone'
    )
    const [one, two, three, four] = data.tracks
    expect(data.albums[0].cover).toBe('spindle://cover/small/one')
    expect(one.art).toBeUndefined()
    expect(two.art).toEqual({
      cover: 'spindle://cover/small/two',
      coverLarge: 'spindle://cover/large/two',
      palette: salt
    })
    // no picture, or one missing from the cache: the album's
    expect(three.art).toBeUndefined()
    expect(four.art).toBeUndefined()
  })

  it('gives an album what a made picture needs: its id and track lengths in disc order (103)', () => {
    const { data } = build([
      entry('/m/nb/d2.mp3', { album: 'Night Bus', artist: 'QH', track: 1, disc: 2, duration: 30 }),
      entry('/m/nb/2.mp3', { album: 'Night Bus', artist: 'QH', track: 2, duration: 241.6 }),
      entry('/m/nb/1.mp3', { album: 'Night Bus', artist: 'QH', track: 1, duration: 180.2 })
    ])
    const al = data.albums[0]
    expect(al.seed).toBe(al.id)
    expect(al.seed).toBe(shortHash('/m/nb\0night bus\0'))
    expect(al.lengths).toEqual([180, 242, 30])
    expect(al).toMatchObject({ title: 'Night Bus', artist: 'QH' })
    // a song of a tagged album shows the album's picture
    expect(data.tracks.every((t) => t.art === undefined)).toBe(true)
  })

  it("shows a song with no album tag in its folder album's picture", () => {
    // the album page and the player must draw the same picture in the same colors
    const { data } = build([
      entry('/m/Holosync/1.flac', { duration: 15.4 }),
      entry('/m/Holosync/2.flac', { duration: 30 })
    ])
    expect(data.tracks.every((t) => t.art === undefined)).toBe(true)
    expect(data.albums[0]).toMatchObject({ seed: data.albums[0].id, lengths: [15, 30] })
  })

  it('keeps a loose song with a folder image on the folder picture (103)', () => {
    const { data } = build([entry('/m/Loose/memo.mp3')], (ix) =>
      ix.images.set('/m/Loose', { path: '/m/Loose/cover.jpg', mtime: 1, size: 1, cover: 'img' })
    )
    expect(data.tracks[0].art).toBeUndefined()
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

describe('folders', () => {
  it('sends each folder once and the folder of each song', () => {
    const ix = emptyIndex()
    for (const f of [
      entry('/m/B/2.mp3', { album: 'B' }),
      entry('/m/A/CD1/1.mp3', { album: 'A', artist: 'X', title: 'one' }),
      entry('/m/A/CD2/1.mp3', { album: 'A', artist: 'X', title: 'two' }),
      entry('/m/loose.mp3')
    ])
      ix.files.set(f.path, f)
    const { data } = buildLibrary(ix, () => true, undefined, ['/m'])
    expect(data.folders).toEqual([
      { name: '/m', parent: -1 },
      { name: 'A', parent: 0 },
      { name: 'CD1', parent: 1 },
      { name: 'CD2', parent: 1 },
      { name: 'B', parent: 0 }
    ])
    // library order: albums by artist, then title
    expect(data.tracks.map((t) => [t.album, data.folders[t.folder].name])).toEqual([
      ['B', 'B'],
      ['m', '/m'],
      ['A', 'CD1'],
      ['A', 'CD2']
    ])
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

describe('covers found online', () => {
  const h = 'f'.repeat(40)
  const local = 'e'.repeat(40)
  const rg = 'f5093c06-23e3-404f-aeaa-40f72885ee3a'
  const files = [
    entry('/m/ar/1.mp3', { album: 'Abbey Road', artist: 'The Beatles', mbReleaseGroup: rg })
  ]
  const albumId = build(files).data.albums[0].id
  const fetched = (key = searchKey('The Beatles', 'Abbey Road')): Fetched =>
    new Map([[albumId, { hash: h, source: 'deezer', at: 0, key }]])

  it('uses a fetched cover when there is no local one', () => {
    const { data } = build(files, undefined, () => true, fetched())
    expect(data.albums[0].cover).toBe(`spindle://cover/small/${h}`)
  })

  it('lets a local cover win', () => {
    const { data } = build([{ ...files[0], cover: local }], undefined, () => true, fetched())
    expect(data.albums[0].cover).toBe(`spindle://cover/small/${local}`)
  })

  it('ignores a fetched cover for other names, or one not in the cache', () => {
    expect(build(files, undefined, () => true, fetched('x\0y')).data.albums[0].cover).toBe('')
    expect(build(files, undefined, (x) => x !== h, fetched()).data.albums[0].cover).toBe('')
  })

  it('lists albums with no local cover and an album tag, in library order', () => {
    const { queries } = build([
      entry('/m/z/1.mp3', { album: 'Zebra', artist: 'Zed' }),
      ...files,
      entry('/m/untagged/1.mp3'),
      entry('/m/c/1.mp3', { album: 'C', artist: 'X', cover: local })
    ])
    expect(queries.map((q) => q.album)).toEqual(['Abbey Road', 'Zebra'])
    expect(queries[0]).toEqual({
      albumId,
      artist: 'The Beatles',
      album: 'Abbey Road',
      year: 0,
      tracks: 1,
      compilation: false,
      noArtist: false,
      key: searchKey('The Beatles', 'Abbey Road'),
      mbReleaseGroup: rg
    })
  })

  it('marks compilations and albums with no artist', () => {
    const { queries } = build([
      entry('/m/comp/1.mp3', { album: 'Hits', artist: 'A' }),
      entry('/m/comp/2.mp3', { album: 'Hits', artist: 'B' }),
      entry('/m/anon/1.mp3', { album: 'Demos' })
    ])
    const by = (a: string): (typeof queries)[number] => queries.find((q) => q.album === a)!
    expect(by('Hits')).toMatchObject({ artist: variousArtists, compilation: true })
    expect(by('Demos')).toMatchObject({ artist: unknownArtist, noArtist: true })
  })

  it('still lists an album that shows a fetched cover, so a stale one is looked up again', () => {
    expect(build(files, undefined, () => true, fetched()).queries).toHaveLength(1)
  })
})

describe('artist photos (ticket 021)', () => {
  const h = 'b'.repeat(40)
  const files = [
    entry('/m/q/1.mp3', {
      album: 'A Night at the Opera',
      artist: 'Queen',
      title: 'Death on Two Legs'
    }),
    entry('/m/q/2.mp3', {
      album: 'A Night at the Opera',
      artist: 'Queen',
      title: 'Lazing on a Sunday'
    }),
    entry('/m/q2/1.mp3', { album: 'Jazz', artist: 'Queen', title: 'Mustapha' }),
    entry('/m/va/1.mp3', { album: 'Hits', artist: 'Blur', title: 'Song 2' }),
    entry('/m/va/2.mp3', { album: 'Hits', artist: 'Blur feat. Queen', title: 'Tender' }),
    entry('/m/va/3.mp3', { album: 'Hits', artist: '!!!', title: 'Heart of Hearts' }),
    entry('/m/u/1.mp3', { title: 'Nameless' })
  ]
  const photos = (key = cleanArtist('Queen')): Fetched =>
    new Map([[artistKey('Queen'), { hash: h, source: 'deezer', at: 0, key }]])

  it('lists artists to look up, with their albums then songs to check them by', () => {
    const { artists } = build(files)
    expect(artists.map((a) => a.name)).toEqual(['Blur', 'Blur feat. Queen', 'Queen'])
    const queen = artists.find((a) => a.name === 'Queen')!
    expect(queen).toMatchObject({ id: artistKey('Queen'), key: cleanArtist('Queen') })
    expect(queen.checks).toEqual([
      { kind: 'album', title: 'A Night at the Opera' },
      { kind: 'album', title: 'Jazz' },
      { kind: 'song', title: 'Death on Two Legs' }
    ])
    expect(artists.find((a) => a.name === 'Blur')!.checks).toEqual([
      { kind: 'song', title: 'Song 2' }
    ])
  })

  it('sends found photos by artist key, for the same name and in the cache only', () => {
    expect(build(files, undefined, () => true, undefined, photos()).data.artistPhotos).toEqual({
      [artistKey('Queen')]: {
        cover: `spindle://cover/small/${h}`,
        coverLarge: `spindle://cover/large/${h}`
      }
    })
    expect(build(files, undefined, () => true, undefined, photos('x')).data.artistPhotos).toEqual(
      {}
    )
    expect(build(files, undefined, (x) => x !== h, undefined, photos()).data.artistPhotos).toEqual(
      {}
    )
  })
})

describe('artist names you changed (tickets 024, 069)', () => {
  const files = [
    entry('/m/s/1.mp3', { album: 'Split', albumArtist: 'sadness, stellafera', artist: 'Sadness' }),
    entry('/m/s/2.mp3', {
      album: 'Split',
      albumArtist: 'sadness, stellafera',
      artist: 'Stellafera'
    }),
    entry('/m/k/1.mp3', { album: 'Gruppa krovi', artist: 'kino', title: 'Gruppa krovi' }),
    entry('/m/b/1.mp3', { album: 'Parklife', artist: 'Blur' })
  ]
  const o = { 'sadness,stellafera': ['Sadness', 'Stellafera'], kino: ['Кино'] }

  it('shows the new names on albums and songs, with the tag kept beside them', () => {
    const { data } = build(files, undefined, () => true, undefined, undefined, o)
    const split = data.albums.find((a) => a.title === 'Split')!
    expect(split).toMatchObject({
      artist: 'Sadness, Stellafera',
      artists: ['Sadness', 'Stellafera'],
      artistTag: 'sadness, stellafera'
    })
    const kino = data.tracks.find((t) => t.title === 'Gruppa krovi')!
    expect(kino).toMatchObject({ artist: 'Кино', artistTag: 'kino' })
    expect(kino.artists).toBeUndefined()
    expect(data.albums.find((a) => a.title === 'Parklife')).not.toHaveProperty('artistTag')
  })

  it('keeps album ids, since albums are still grouped by the tags', () => {
    const ids = (d: LibraryData): string[] => d.albums.map((a) => a.id).sort()
    expect(ids(build(files, undefined, () => true, undefined, undefined, o).data)).toEqual(
      ids(build(files).data)
    )
  })

  it('sorts albums by the name shown', () => {
    const { data } = build(files, undefined, () => true, undefined, undefined, o)
    expect(data.albums.map((a) => a.artist)).toEqual(['Blur', 'Sadness, Stellafera', 'Кино'])
  })

  it('looks covers up by the tags, and artist photos by the new names', () => {
    const { queries, artists } = build(files, undefined, () => false, undefined, undefined, o)
    expect(queries.map((q) => q.artist).sort()).toEqual(['Blur', 'kino', 'sadness, stellafera'])
    expect(artists.map((a) => a.name)).toEqual(['Blur', 'Sadness', 'Stellafera', 'Кино'])
    expect(artists.find((a) => a.name === 'Кино')!.checks).toEqual([
      { kind: 'album', title: 'Gruppa krovi' },
      { kind: 'song', title: 'Gruppa krovi' }
    ])
    // a band of a split album is checked by its own songs on it (title from the file name)
    expect(artists.find((a) => a.name === 'Stellafera')!.checks).toEqual([
      { kind: 'album', title: 'Split' },
      { kind: 'song', title: '2' }
    ])
  })
})

describe('artist spellings the AI grouped (tickets 068, 069)', () => {
  const files = [
    entry('/m/a/1.mp3', { album: 'Debut', artist: 'Bjork' }),
    entry('/m/b/1.mp3', { album: 'Homogenic', artist: 'Björk' }),
    entry('/m/c/1.mp3', { album: 'Blood', artist: 'Kino', title: 'Blood' }),
    entry('/m/d/1.mp3', { album: 'Gruppa krovi', artist: 'Кино' })
  ]
  const g = { bjork: 'Björk', björk: 'Björk', kino: 'Кино', кино: 'Кино' }
  const albumOf = (d: LibraryData, title: string): LibraryData['albums'][number] =>
    d.albums.find((a) => a.title === title)!

  it('shows the group name on albums and songs, with the tag kept beside it', () => {
    const { data } = build(files, undefined, () => true, undefined, undefined, undefined, g)
    expect(albumOf(data, 'Debut')).toMatchObject({
      artist: 'Björk',
      artistTag: 'Bjork',
      grouped: true
    })
    expect(data.tracks.find((t) => t.title === 'Blood')).toMatchObject({
      artist: 'Кино',
      artistTag: 'Kino',
      grouped: true
    })
    // spelled as the group name: as it is
    expect(albumOf(data, 'Homogenic')).not.toHaveProperty('artistTag')
  })

  it("lets your link win over the AI's", () => {
    const o = { kino: ['KINO'] }
    const { data } = build(files, undefined, () => true, undefined, undefined, o, g)
    expect(albumOf(data, 'Blood')).toMatchObject({ artist: 'KINO', artistTag: 'Kino' })
    expect(albumOf(data, 'Blood')).not.toHaveProperty('grouped')
  })

  it('shows a tag you kept as its own name (Use tag) as the plain tag', () => {
    const o = { kino: ['Kino'] }
    const { data } = build(files, undefined, () => true, undefined, undefined, o, g)
    const blood = albumOf(data, 'Blood')
    expect(blood.artist).toBe('Kino')
    expect(blood).not.toHaveProperty('artistTag')
    expect(blood).not.toHaveProperty('grouped')
  })

  it('keeps album ids, since albums are still grouped by the tags', () => {
    const ids = (d: LibraryData): string[] => d.albums.map((a) => a.id).sort()
    const grouped = build(files, undefined, () => true, undefined, undefined, undefined, g)
    expect(ids(grouped.data)).toEqual(ids(build(files).data))
  })

  it('looks artist photos up by the group name, album covers by the tags', () => {
    const { queries, artists } = build(files, undefined, () => false, undefined, undefined, {}, g)
    expect(artists.map((a) => a.name)).toEqual(['Björk', 'Кино'])
    expect(queries.map((q) => q.artist).sort()).toEqual(['Bjork', 'Björk', 'Kino', 'Кино'])
  })
})

describe('library patches (ticket 022)', () => {
  const h1 = 'c'.repeat(40)
  const h2 = 'd'.repeat(40)
  const queen = (hash: string): Fetched =>
    new Map([[artistKey('Queen'), { hash, source: 'deezer', at: 0, key: cleanArtist('Queen') }]])
  const roots = ['/m', '/n']
  const buildNow = (files: FileEntry[], photos?: Fetched): LibraryData => {
    const ix = emptyIndex()
    for (const f of files) ix.files.set(f.path, f)
    return buildLibrary(ix, () => true, undefined, roots, photos).data
  }

  // The page's side: what it keeps, and the library it shows from that.
  function page(start: LibraryData): {
    take: (p: PatchBody) => void
    shown: () => LibraryData
  } {
    const tracks = new Map(start.tracks.map((t) => [t.id, t]))
    let held: HeldLibrary = {
      albums: start.albums,
      folders: start.folders,
      photos: start.artistPhotos ?? {}
    }
    return {
      take: (p) => (held = applyPatch(held, tracks, p)),
      shown: () => ({
        albums: held.albums,
        tracks: held.albums.flatMap((a) => a.trackIds.map((id) => tracks.get(id)!)),
        folders: held.folders,
        artistPhotos: held.photos
      })
    }
  }

  it('gives the page the same library as a full build, folders and photos too', () => {
    const zed = entry('/m/Zed/1.mp3', { album: 'Jazz', artist: 'Queen', title: 'Mustapha' })
    const gold1 = entry('/m/Abba/Gold/1.mp3', { album: 'Gold', artist: 'ABBA', title: 'SOS' })
    const gold2 = entry('/m/Abba/Gold/2.mp3', { album: 'Gold', artist: 'ABBA', title: 'Mamma' })
    const other = entry('/n/x/1.mp3', { album: 'X', artist: 'Blur', title: 'Song 2' })
    const cd1 = entry('/m/Beta/CD1/1.mp3', { album: 'Beta', artist: 'Queen', title: 'One' })
    // files come in walk order, not name order, and photos while the lookup runs
    const steps: [FileEntry[], Fetched?][] = [
      [[zed]],
      [[zed, gold1, gold2]],
      [[zed, gold1, gold2, other], queen(h1)],
      [[zed, gold1, gold2, other, cd1, { ...gold1, title: 'S.O.S.' }], queen(h2)],
      [[gold1, other]]
    ]
    const empty = buildNow([])
    const p = page(empty)
    let last = empty
    const sent: PatchBody[] = []
    for (const [files, photos] of steps) {
      const next = buildNow(files, photos)
      const d = diffLibrary(last, next)!
      sent.push(d)
      p.take(d)
      expect(p.shown()).toEqual(next)
      last = next
    }
    // Abba came before Zed: Zed's folder moved, and its song was not sent again
    expect(sent[1].folderMoves).toBeDefined()
    expect(sent[1].tracks.map((t) => t.title).sort()).toEqual(['Mamma', 'SOS'])
    expect(sent[2].photos).toEqual({ [artistKey('Queen')]: expect.anything() })
    // Queen's songs left, and with them the photo
    expect(sent[4].gonePhotos).toEqual([artistKey('Queen')])
    expect(p.shown().folders.map((f) => f.name)).toEqual(['/m', 'Abba', 'Gold', '/n', 'x'])
  })

  it('sends only photos when only a photo was found', () => {
    const files = [entry('/m/q/1.mp3', { album: 'Jazz', artist: 'Queen', title: 'Mustapha' })]
    const d = diffLibrary(buildNow(files), buildNow(files, queen(h1)))!
    expect(d).toEqual({
      albums: [],
      tracks: [],
      goneTracks: [],
      photos: {
        [artistKey('Queen')]: {
          cover: `spindle://cover/small/${h1}`,
          coverLarge: `spindle://cover/large/${h1}`
        }
      }
    })
  })
})
