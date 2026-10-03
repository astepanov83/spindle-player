// The view path the scroll places use (ticket 042), with the search results
// of ticket 039 as a view below the one they cover.
import { beforeEach, describe, expect, it, vi } from 'vitest'

// radio's page half hears main from the start
vi.stubGlobal('window', {
  radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
})

let library: typeof import('../stores/library.svelte').library
let libraryView: typeof import('./scroll-top.svelte').libraryView

beforeEach(async () => {
  vi.resetModules()
  library = (await import('../stores/library.svelte')).library
  libraryView = (await import('./scroll-top.svelte')).libraryView
  const { settings } = await import('../stores/settings.svelte')
  settings.plugins = { files: true, radio: true, mfp: true }
})

// the path of `tab` with `page` open, searched for `query`
function path(tab: string, page = '', query = ''): string[] {
  library.openPage(tab, page)
  library.query = query
  return libraryView().path
}

describe('libraryView while searching', () => {
  it('puts the results below the grid or the open album', () => {
    expect(path('albums', '', 'harbor')).toEqual(['albums', 'search'])
    expect(path('albums', 'album/a', 'harbor')).toEqual(['albums', 'album:a', 'search'])
    library.showAll('files:songs')
    expect(libraryView().path).toEqual(['albums', 'album:a', 'search', 'all:files:songs'])
  })

  it('puts the filtered artist grid below the open artist', () => {
    expect(path('artists', 'artist/k', 'o')).toEqual(['artists', 'artist:k', 'search'])
  })

  it('adds nothing for views that filter in place, or for spaces', () => {
    expect(path('folders', '', 'x')).toEqual(['folders'])
    expect(path('songs', '', 'x')).toEqual(['songs'])
    expect(path('albums', '', '  ')).toEqual(['albums'])
  })
})

describe('libraryView for MFP (ticket 052)', () => {
  it('puts the open episode below the list, and filters the list in place', () => {
    expect(path('mfp')).toEqual(['mfp'])
    expect(path('mfp', 'episode/e')).toEqual(['mfp', 'episode:e'])
    expect(path('mfp', 'episode/e', 'x')).toEqual(['mfp', 'episode:e'])
  })
})

describe('libraryView for playlists and radio', () => {
  it('puts the open playlist below the list, in both templates', () => {
    expect(path('playlists')).toEqual(['playlists'])
    expect(path('playlists', 'playlist/p1')).toEqual(['playlists', 'pl:p1'])
    expect(path('radio', '', 'jazz')).toEqual(['radio'])
  })
})
