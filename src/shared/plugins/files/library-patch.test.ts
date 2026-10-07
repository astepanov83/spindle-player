import { describe, expect, it } from 'vitest'
import type { Album, LibraryData, Track } from '../../library'
import type { ThemePalettes } from '../../palette'
import {
  applyPatch,
  diffLibrary,
  patchStep,
  same,
  type HeldLibrary,
  type LibraryPatch
} from './library-patch'

const palette: ThemePalettes = {
  dark: ['#111111', '#222222', '#333333'],
  light: ['#111111', '#222222', '#333333']
}

const track = (id: string, albumId: string, more: Partial<Track> = {}): Track => ({
  id,
  title: id,
  duration: 100,
  albumId,
  artist: 'A',
  album: albumId,
  no: 1,
  disc: 1,
  codec: 'FLAC',
  folder: 0,
  ...more
})

const album = (id: string, trackIds: string[], more: Partial<Album> = {}): Album => ({
  id,
  title: id,
  artist: 'A',
  year: 0,
  added: 0,
  palette,
  cover: '',
  coverLarge: '',
  trackIds,
  ...more
})

const lib = (albums: Album[], tracks: Track[]): LibraryData => ({
  albums,
  tracks,
  folders: [{ name: '/m', parent: -1 }],
  artistPhotos: {}
})

const held = (l: LibraryData): HeldLibrary => ({
  albums: l.albums,
  folders: l.folders,
  photos: l.artistPhotos ?? {}
})

// What the page has after the patch: albums in order, and every track by id.
function patched(old: LibraryData, next: LibraryData): LibraryData {
  const d = diffLibrary(old, next)
  if (!d) return old
  const tracks = new Map(old.tracks.map((t) => [t.id, t]))
  const h = applyPatch(held(old), tracks, d)
  return {
    albums: h.albums,
    tracks: h.albums.flatMap((a) => a.trackIds.map((id) => tracks.get(id)!)),
    folders: h.folders,
    artistPhotos: h.photos
  }
}

describe('same', () => {
  it('compares JSON values deeply', () => {
    expect(same({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toBe(true)
    expect(same({ a: [1, { b: 'x' }] }, { a: [1, { b: 'y' }] })).toBe(false)
    expect(same({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(same([1, 2], [1, 2, 3])).toBe(false)
    expect(same([], {})).toBe(false)
    expect(same(null, {})).toBe(false)
  })
})

describe('diffLibrary', () => {
  const base = lib(
    [album('x', ['1', '2']), album('y', ['3'])],
    [track('1', 'x'), track('2', 'x'), track('3', 'y')]
  )

  it('is nothing when nothing changed', () => {
    const copy = JSON.parse(JSON.stringify(base)) as LibraryData
    expect(diffLibrary(base, copy)).toBeUndefined()
  })

  it('sends only new and changed songs and albums, and no order when it is the same', () => {
    const next = lib(
      [album('x', ['1', '2', '4']), album('y', ['3'])],
      [track('1', 'x'), track('2', 'x', { title: 'New name' }), track('4', 'x'), track('3', 'y')]
    )
    const d = diffLibrary(base, next)!
    expect(d.tracks.map((t) => t.id)).toEqual(['2', '4'])
    expect(d.albums.map((a) => a.id)).toEqual(['x'])
    expect(d.order).toBeUndefined()
    expect(d.goneTracks).toEqual([])
    expect(patched(base, next)).toEqual(next)
  })

  it('sends the album order when albums come, go or move', () => {
    const next = lib(
      [album('z', ['5']), album('x', ['1', '2'])],
      [track('5', 'z'), track('1', 'x'), track('2', 'x')]
    )
    const d = diffLibrary(base, next)!
    expect(d.order).toEqual(['z', 'x'])
    expect(d.albums.map((a) => a.id)).toEqual(['z'])
    expect(d.goneTracks).toEqual(['3'])
    expect(patched(base, next)).toEqual(next)
  })

  it('keeps the objects of songs and albums that did not change', () => {
    const next = lib(
      [album('x', ['1', '2']), album('y', ['3', '6'])],
      [track('1', 'x'), track('2', 'x'), track('3', 'y'), track('6', 'y')]
    )
    const tracks = new Map(base.tracks.map((t) => [t.id, t]))
    const one = tracks.get('1')
    const { albums } = applyPatch(held(base), tracks, diffLibrary(base, next)!)
    expect(albums[0]).toBe(base.albums[0])
    expect(tracks.get('1')).toBe(one)
  })
})

describe('applyPatch', () => {
  it('gives the same album list when only songs changed', () => {
    const next = lib(base().albums, [track('1', 'x', { duration: 5 })])
    const tracks = new Map(base().tracks.map((t) => [t.id, t]))
    const old = held(base())
    const out = applyPatch(old, tracks, diffLibrary(base(), next)!)
    expect(out.albums).toBe(old.albums)
    expect(out.folders).toBe(old.folders)
    expect(out.photos).toBe(old.photos)
    expect(tracks.get('1')?.duration).toBe(5)
  })

  it('throws on an order with an album it does not have', () => {
    const p = { albums: [], tracks: [track('2', 'x')], goneTracks: ['1'], order: ['nope'] }
    const tracks = new Map(base().tracks.map((t) => [t.id, t]))
    expect(() => applyPatch(held(base()), tracks, p)).toThrow()
    // nothing changed
    expect([...tracks.keys()]).toEqual(['1'])
  })

  it('throws when a folder went and a song still in it was not sent', () => {
    const p = {
      albums: [],
      tracks: [],
      goneTracks: [],
      folders: [{ name: '/n', parent: -1 }],
      folderMoves: [-1]
    }
    const tracks = new Map(base().tracks.map((t) => [t.id, t]))
    const one = tracks.get('1')
    expect(() => applyPatch(held(base()), tracks, p)).toThrow()
    expect(tracks.get('1')).toBe(one)
  })

  it('renumbers songs whose folder moved, and drops photos that went', () => {
    const old = { ...base(), artistPhotos: { a: { cover: 'x', coverLarge: 'y' } } }
    const next: LibraryData = {
      ...base(),
      folders: [
        { name: '/a', parent: -1 },
        { name: '/m', parent: -1 }
      ],
      tracks: [track('1', 'x', { folder: 1 })],
      artistPhotos: {}
    }
    const d = diffLibrary(old, next)!
    expect(d.tracks).toEqual([])
    expect(d.folderMoves).toEqual([1])
    expect(d.gonePhotos).toEqual(['a'])
    expect(patched(old, next)).toEqual(next)
  })

  function base(): LibraryData {
    return lib([album('x', ['1'])], [track('1', 'x')])
  }
})

describe('patchStep', () => {
  const patch = (epoch: string, from: number, n: number): LibraryPatch => ({
    patch: true,
    epoch,
    from,
    n,
    albums: [],
    tracks: [],
    goneTracks: []
  })

  it('applies a patch made on what the page has', () => {
    expect(patchStep({ epoch: 'a', n: 3 }, patch('a', 3, 4))).toBe('apply')
  })

  it('skips a patch the page already has (it came before the full library)', () => {
    expect(patchStep({ epoch: 'a', n: 4 }, patch('a', 3, 4))).toBe('skip')
    expect(patchStep({ epoch: 'a', n: 5 }, patch('a', 3, 4))).toBe('skip')
  })

  it('asks for the whole library when one was missed or the library process started again', () => {
    expect(patchStep({ epoch: 'a', n: 3 }, patch('a', 4, 5))).toBe('fetch')
    expect(patchStep({ epoch: 'a', n: 9 }, patch('b', 0, 1))).toBe('fetch')
    expect(patchStep(undefined, patch('a', 0, 1))).toBe('fetch')
  })

  it('loads a whole library unless the page has a newer one from the same process', () => {
    const full = (epoch: string, n: number): LibraryData & { epoch: string; n: number } => ({
      epoch,
      n,
      albums: [],
      tracks: [],
      folders: []
    })
    expect(patchStep(undefined, full('a', 0))).toBe('apply')
    expect(patchStep({ epoch: 'a', n: 3 }, full('a', 3))).toBe('apply')
    expect(patchStep({ epoch: 'a', n: 3 }, full('b', 0))).toBe('apply')
    expect(patchStep({ epoch: 'a', n: 4 }, full('a', 3))).toBe('skip')
  })
})
