// The library store's mouse Back and Forward between a list and a page.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryData } from '../../../shared/library'
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
  return { albums, tracks: [], folders: [] }
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

  it('Back goes up a folder and Forward goes back down', () => {
    const track = (id: string, folder: number): LibraryData['tracks'][number] => ({
      id,
      title: id,
      duration: 1,
      albumId: 'a',
      artist: '',
      album: '',
      no: 1,
      disc: 1,
      codec: '',
      folder
    })
    library.load({
      ...lib('a'),
      tracks: [track('x', 2)],
      folders: [
        { name: '/m', parent: -1 },
        { name: 'A', parent: 0 },
        { name: 'B', parent: 1 }
      ]
    })
    const deep = library.folders.nodes[2].key
    library.openFolder(deep)
    library.back('folder')
    expect(library.folder).toBe(library.folders.nodes[1].key)
    // the album side is not touched
    library.forward('open')
    library.forward('folder')
    expect(library.folder).toBe(deep)
  })

  it('Forward skips an album a rescan removed', () => {
    library.open = 'b'
    library.back('open')
    library.load(lib('a'))
    library.forward('open')
    expect(library.open).toBeNull()
  })
})
