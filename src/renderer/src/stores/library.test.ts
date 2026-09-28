// The library store's mouse Back and Forward between a list and a page.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryData, Track } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'

let library: typeof import('./library.svelte').library

function lib(...ids: string[]): LibraryData {
  const albums = ids.map((id) => ({
    id,
    title: `Album ${id}`,
    artist: 'X',
    year: 0,
    palette: defaultPalettes,
    cover: '',
    coverLarge: '',
    trackIds: []
  }))
  return { albums, tracks: [] }
}

// a fresh store each time, so nothing Back closed carries over
beforeEach(async () => {
  vi.resetModules()
  library = (await import('./library.svelte')).library
  library.load(lib('a', 'b'))
})

describe('mouse Back and Forward', () => {
  it('Back closes the open album and Forward opens it again', () => {
    library.open = 'a'
    library.back('open')
    expect(library.open).toBeNull()
    library.forward('open')
    expect(library.open).toBe('a')
  })

  it('Back on the grid does nothing', () => {
    library.back('open')
    expect(library.open).toBeNull()
    library.forward('open')
    expect(library.open).toBeNull()
  })

  it('Forward does nothing while a page is open', () => {
    library.open = 'a'
    library.back('open')
    library.open = 'b'
    library.forward('open')
    expect(library.open).toBe('b')
  })

  it('Forward reopens the album Back closed last', () => {
    library.open = 'a'
    library.back('open')
    library.open = 'b'
    library.back('open')
    library.forward('open')
    expect(library.open).toBe('b')
  })

  it('Forward does not open an album closed on the playlist side', () => {
    library.openPlaylist = 'p'
    library.back('openPlaylist')
    library.forward('open')
    expect(library.open).toBeNull()
    library.forward('openPlaylist')
    expect(library.openPlaylist).toBe('p')
  })

  it('Forward skips an album a rescan removed', () => {
    library.open = 'b'
    library.back('open')
    library.load(lib('a'))
    library.forward('open')
    expect(library.open).toBeNull()
  })
})

describe('patches while a scan runs', () => {
  const song = (id: string, albumId: string): Track => ({
    id,
    title: id,
    duration: 1,
    albumId,
    artist: 'X',
    album: albumId,
    no: 1,
    disc: 1,
    codec: ''
  })

  function start(): void {
    const l = lib('a', 'b')
    l.albums[0].trackIds = ['a1']
    l.albums[1].trackIds = ['b1']
    library.load({ ...l, tracks: [song('a1', 'a'), song('b1', 'b')], epoch: 'e', n: 0 })
  }

  it('adds songs and keeps the album list, the open album and the songs shown', () => {
    start()
    library.open = 'b'
    const albums = library.albums
    const a1 = library.track('a1')
    const gone = library.patch({
      patch: true,
      epoch: 'e',
      from: 0,
      n: 1,
      albums: [{ ...albums[1], trackIds: ['b1', 'b2'] }],
      tracks: [song('b2', 'b')],
      goneTracks: []
    })
    expect(gone).toBe(false)
    expect(library.sent).toEqual({ epoch: 'e', n: 1 })
    expect(library.open).toBe('b')
    expect(library.albums[0]).toBe(albums[0])
    expect(library.track('a1')).toBe(a1)
    expect(library.album('b').trackIds).toEqual(['b1', 'b2'])
    // library order follows the albums
    expect(library.order(library.track('b2'))).toBe(2)
  })

  it('keeps the same album list when only songs changed', () => {
    start()
    const albums = library.albums
    library.patch({
      patch: true,
      epoch: 'e',
      from: 0,
      n: 1,
      albums: [],
      tracks: [{ ...song('a1', 'a'), title: 'Renamed' }],
      goneTracks: []
    })
    expect(library.albums).toBe(albums)
    expect(library.track('a1').title).toBe('Renamed')
  })

  it('reports songs that left, and closes an album that is gone', () => {
    start()
    library.open = 'b'
    const gone = library.patch({
      patch: true,
      epoch: 'e',
      from: 0,
      n: 1,
      albums: [],
      order: ['a'],
      tracks: [],
      goneTracks: ['b1']
    })
    expect(gone).toBe(true)
    expect(library.open).toBeNull()
    expect(library.has('b1')).toBe(false)
  })
})
