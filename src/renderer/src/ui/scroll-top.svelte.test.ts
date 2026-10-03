// The view path the scroll places use (ticket 042), with the search results
// of ticket 039 as a view below the one they cover.
import { beforeEach, describe, expect, it, vi } from 'vitest'

let library: typeof import('../stores/library.svelte').library
let libraryView: typeof import('./scroll-top.svelte').libraryView

beforeEach(async () => {
  vi.resetModules()
  library = (await import('../stores/library.svelte')).library
  libraryView = (await import('./scroll-top.svelte')).libraryView
})

describe('libraryView while searching', () => {
  it('puts the results below the grid or the open album', () => {
    library.query = 'harbor'
    expect(libraryView('albums').path).toEqual(['albums', 'search'])
    library.openAlbum('a')
    library.query = 'harbor'
    expect(libraryView('albums').path).toEqual(['albums', 'album:a', 'search'])
    library.showAll('songs')
    expect(libraryView('albums').path).toEqual(['albums', 'album:a', 'search', 'all:songs'])
  })

  it('puts the filtered artist grid below the open artist', () => {
    library.openArtist('k')
    library.query = 'o'
    expect(libraryView('artists').path).toEqual(['artists', 'artist:k', 'search'])
  })

  it('adds nothing for views that filter in place, or for spaces', () => {
    library.query = 'x'
    expect(libraryView('folders').path).toEqual(['folders'])
    expect(libraryView('songs').path).toEqual(['songs'])
    library.query = '  '
    expect(libraryView('albums').path).toEqual(['albums'])
  })
})

describe('libraryView for MFP (ticket 052)', () => {
  it('puts the open episode below the list, and filters the list in place', () => {
    expect(libraryView('mfp').path).toEqual(['mfp'])
    library.openEpisode('e')
    expect(libraryView('mfp').path).toEqual(['mfp', 'episode:e'])
    library.query = 'x'
    expect(libraryView('mfp').path).toEqual(['mfp', 'episode:e'])
  })
})
