// The files plugin's tabs and pages, for a small made-up library: two
// albums by one artist in a folder two deep.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Album, LibraryData, Track } from '../../../../shared/library'
import { defaultPalettes } from '../../../../shared/palette'

let library: typeof import('../../stores/library.svelte').library
let nav: typeof import('./nav')

const album = (id: string, trackIds: string[], extra: Partial<Album> = {}): Album => ({
  id,
  title: `Album ${id}`,
  artist: 'Marina Vale',
  year: 0,
  palette: defaultPalettes,
  cover: '',
  coverLarge: '',
  trackIds,
  ...extra
})

const track = (id: string, albumId: string, extra: Partial<Track> = {}): Track => ({
  id,
  title: id,
  duration: 1,
  albumId,
  artist: 'Marina Vale',
  album: albumId,
  no: 1,
  disc: 1,
  codec: '',
  folder: 2,
  ...extra
})

function lib(...ids: string[]): LibraryData {
  return {
    albums: ids.map((id) => album(id, [`${id}1`])),
    tracks: ids.map((id) => track(`${id}1`, id)),
    folders: [
      { name: '/m', parent: -1 },
      { name: 'Rock', parent: 0 },
      { name: 'Live', parent: 1 }
    ]
  }
}

beforeEach(async () => {
  vi.resetModules()
  library = (await import('../../stores/library.svelte')).library
  nav = await import('./nav')
  library.load(lib('a', 'b'))
})

const files = (page: string): { plugin: 'files'; page: string } => ({ plugin: 'files', page })

describe('files pages', () => {
  it('can open what the library has', () => {
    expect(nav.canOpenFiles(files('album/a'))).toBe(true)
    expect(nav.canOpenFiles(files('album/gone'))).toBe(false)
    expect(nav.canOpenFiles(files('artist/marinavale'))).toBe(true)
    expect(nav.canOpenFiles(files('artist/nobody'))).toBe(false)
    const live = library.folders.nodes[2].key
    expect(nav.canOpenFiles(files(`folder/${live}`))).toBe(true)
    expect(nav.canOpenFiles(files('folder/nowhere'))).toBe(false)
  })

  it('keep what is left after a rescan', () => {
    library.load(lib('a'))
    expect(nav.keepFiles('albums', 'album/a')).toBe('album/a')
    expect(nav.keepFiles('albums', 'album/b')).toBe('')
    // an album under its artist shows the artist when it is gone
    expect(nav.keepFiles('artists', 'album/b/artist/marinavale')).toBe('artist/marinavale')
    expect(nav.keepFiles('artists', 'album/a/artist/marinavale')).toBe('album/a/artist/marinavale')
    expect(nav.keepFiles('artists', 'artist/nobody')).toBe('')
    // a folder stays: the view shows the nearest one above
    expect(nav.keepFiles('folders', 'folder/nowhere')).toBe('folder/nowhere')
    expect(nav.keepFiles('albums', 'radio/x')).toBe('')
  })

  it('give each page its place under the tab, for the scroll places', () => {
    const [m, rock, live] = library.folders.nodes.map((n) => n.key)
    expect(nav.filesPath('albums', '')).toEqual([])
    expect(nav.filesPath('albums', 'album/a')).toEqual(['album:a'])
    expect(nav.filesPath('artists', 'album/a/artist/marinavale')).toEqual([
      'artist:marinavale',
      'album:a'
    ])
    expect(nav.filesPath('folders', `folder/${live}`)).toEqual(
      [m, rock, live].map((k) => `folder:${k}`)
    )
    // the search results and the filtered grid are a view below the page
    library.query = 'x'
    expect(nav.filesPath('albums', 'album/a')).toEqual(['album:a', 'search'])
    expect(nav.filesPath('artists', '')).toEqual(['search'])
    expect(nav.filesPath('folders', '')).toEqual([`folder:${m}`])
  })

  it('give the tabs, Songs only for Classic', () => {
    expect(nav.filesTabs().map((t) => [t.id, t.only])).toEqual([
      ['songs', 'sidebar'],
      ['albums', undefined],
      ['artists', undefined],
      ['folders', undefined]
    ])
    library.openPage('folders', `folder/${library.folders.nodes[2].key}`)
    expect(nav.filesTabs()[3].search).toBe('Search this folder')
  })
})
