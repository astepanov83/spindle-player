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
