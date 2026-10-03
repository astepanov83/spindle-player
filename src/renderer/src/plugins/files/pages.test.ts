// The files plugin's page strings.
import { describe, expect, it } from 'vitest'
import { albumPage, artistPage, filesTabOf, folderPage, parsePage } from './pages'

describe('files page strings', () => {
  it('read back what they were made from', () => {
    expect(parsePage('')).toEqual({ kind: 'top' })
    expect(parsePage(albumPage('77c1'))).toEqual({ kind: 'album', id: '77c1' })
    expect(parsePage(artistPage('ac/dc'))).toEqual({ kind: 'artist', key: 'ac/dc' })
    expect(parsePage(artistPage('ac/dc', '77c1'))).toEqual({
      kind: 'artist',
      key: 'ac/dc',
      album: '77c1'
    })
    const key = '/m/rock\0live'
    expect(parsePage(folderPage(key))).toEqual({ kind: 'folder', key })
  })

  it('know nothing of other pages', () => {
    for (const p of ['album/', 'artist/', 'episode/e', 'album/a/b', 'albums', 'album/a/artist/'])
      expect(parsePage(p)).toBeUndefined()
  })

  it('open a link in its tab', () => {
    expect(filesTabOf('album/a')).toBe('albums')
    expect(filesTabOf('artist/x')).toBe('artists')
    expect(filesTabOf('folder/k')).toBe('folders')
    // an album under an artist is no link
    expect(filesTabOf(artistPage('x', 'a'))).toBeUndefined()
    expect(filesTabOf('')).toBeUndefined()
    expect(filesTabOf('episode/e')).toBeUndefined()
  })
})
