// The files plugin's page strings.
import { describe, expect, it } from 'vitest'
import {
  albumPage,
  artistPage,
  filesTabOf,
  fixesPage,
  folderPage,
  genrePage,
  parsePage
} from './pages'

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
    expect(parsePage(fixesPage)).toEqual({ kind: 'fixes' })
    // a genre key may hold a "/" (ticket 123)
    expect(parsePage(genrePage('hiphop/rap'))).toEqual({ kind: 'genre', key: 'hiphop/rap' })
    expect(parsePage(genrePage('hiphop/rap', '77c1'))).toEqual({
      kind: 'genre',
      key: 'hiphop/rap',
      album: '77c1'
    })
  })

  it('know nothing of other pages', () => {
    for (const p of [
      'album/',
      'artist/',
      'episode/e',
      'album/a/b',
      'albums',
      'album/a/artist/',
      'genre/',
      'album/a/genre/'
    ])
      expect(parsePage(p)).toBeUndefined()
  })

  it('open a link in its tab', () => {
    expect(filesTabOf('album/a')).toBe('albums')
    expect(filesTabOf('artist/x')).toBe('artists')
    expect(filesTabOf('folder/k')).toBe('folders')
    expect(filesTabOf(fixesPage)).toBe('artists')
    expect(filesTabOf(genrePage('rock'))).toBe('genres')
    expect(filesTabOf(genrePage('rock', 'a'))).toBeUndefined()
    // an album under an artist is no link
    expect(filesTabOf(artistPage('x', 'a'))).toBeUndefined()
    expect(filesTabOf('')).toBeUndefined()
    expect(filesTabOf('episode/e')).toBeUndefined()
  })
})
