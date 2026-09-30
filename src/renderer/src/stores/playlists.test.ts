// The playlists store, with main's save faked.
import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { playlistsApi: { save: vi.fn() } })
vi.stubGlobal('crypto', {
  randomUUID: (() => {
    let n = 0
    return () => `p${++n}`
  })()
})

const { playlists } = await import('./playlists.svelte')
const { library } = await import('./library.svelte')

describe('removing a playlist', () => {
  it('drops its sort and keeps the others', () => {
    const a = playlists.create()
    const b = playlists.create()
    library.sortPlaylist(a, 't')
    library.sortPlaylist(b, 'd')
    playlists.remove(a)
    expect(library.playlistSorts).toEqual({ [b]: { k: 'd', dir: 1 } })
    expect(library.playlistSort(a)).toBeNull()
  })
})

describe('removing a closed playlist', () => {
  it('does not come back on mouse Forward', () => {
    const a = playlists.create()
    library.openPlaylist = a
    library.back('openPlaylist')
    playlists.remove(a)
    library.forward('openPlaylist')
    expect(library.openPlaylist).toBeNull()
  })
})

describe('removing a playlist while its rows are filtered (ticket 039)', () => {
  it('clears the search text, which was for its rows', () => {
    const a = playlists.create()
    library.section = `pl:${a}`
    library.query = 'blue'
    playlists.remove(a)
    expect(library.section).toBe('songs')
    expect(library.query).toBe('')
  })

  it('keeps the text when another playlist is removed', () => {
    const a = playlists.create()
    const b = playlists.create()
    library.section = `pl:${a}`
    library.query = 'blue'
    playlists.remove(b)
    expect(library.query).toBe('blue')
  })
})
