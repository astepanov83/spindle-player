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
