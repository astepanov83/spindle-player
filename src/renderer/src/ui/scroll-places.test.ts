// Where a library view starts: its old place on the way back up, else the top.
import { describe, expect, it } from 'vitest'
import { ScrollPlaces, type View } from './scroll-places'

const at = (...path: string[]): View => ({ path, query: '' })

describe('ScrollPlaces', () => {
  it('starts the first view at the top', () => {
    expect(new ScrollPlaces<number>().move(undefined, 0, at('albums'))).toBe('top')
  })

  it('opens an album at the top and goes back to the grid where it was', () => {
    const p = new ScrollPlaces<number>()
    expect(p.move(at('albums'), 900, at('albums', 'album:x'))).toBe('top')
    expect(p.move(at('albums', 'album:x'), 120, at('albums'))).toBe(900)
  })

  it('keeps each folder of a two deep path', () => {
    const p = new ScrollPlaces<number>()
    expect(p.move(at('folders'), 100, at('folders', 'a'))).toBe('top')
    expect(p.move(at('folders', 'a'), 200, at('folders', 'a', 'a/b'))).toBe('top')
    expect(p.move(at('folders', 'a', 'a/b'), 50, at('folders', 'a'))).toBe(200)
    expect(p.move(at('folders', 'a'), 200, at('folders'))).toBe(100)
  })

  it('jumps up two folders from the path bar', () => {
    const p = new ScrollPlaces<number>()
    p.move(at('folders'), 100, at('folders', 'a'))
    p.move(at('folders', 'a'), 200, at('folders', 'a', 'a/b'))
    expect(p.move(at('folders', 'a', 'a/b'), 0, at('folders'))).toBe(100)
  })

  it('goes from an artist to an album and back to the artist, then the grid', () => {
    const p = new ScrollPlaces<number>()
    p.move(at('artists'), 300, at('artists', 'artist:k'))
    p.move(at('artists', 'artist:k'), 50, at('artists', 'artist:k', 'album:x'))
    expect(p.move(at('artists', 'artist:k', 'album:x'), 0, at('artists', 'artist:k'))).toBe(50)
    expect(p.move(at('artists', 'artist:k'), 50, at('artists'))).toBe(300)
  })

  it('starts a sibling or another section at the top', () => {
    const p = new ScrollPlaces<number>()
    p.move(at('folders', 'a'), 200, at('folders', 'a', 'a/b'))
    expect(p.move(at('folders', 'a', 'a/b'), 40, at('folders', 'a', 'a/c'))).toBe('top')
    expect(p.move(at('folders', 'a', 'a/c'), 40, at('albums'))).toBe('top')
  })

  it('goes back to the top on Forward, even to a page seen before', () => {
    const p = new ScrollPlaces<number>()
    p.move(at('albums'), 900, at('albums', 'album:x'))
    p.move(at('albums', 'album:x'), 300, at('albums'))
    expect(p.move(at('albums'), 900, at('albums', 'album:x'))).toBe('top')
  })

  it('keeps the latest place a view was left at', () => {
    const p = new ScrollPlaces<number>()
    p.move(at('albums'), 900, at('albums', 'album:x'))
    p.move(at('albums', 'album:x'), 0, at('albums'))
    p.move(at('albums'), 400, at('albums', 'album:y'))
    expect(p.move(at('albums', 'album:y'), 0, at('albums'))).toBe(400)
  })

  it('starts at the top when going up with other search text', () => {
    const p = new ScrollPlaces<number>()
    p.move(at('albums'), 900, at('albums', 'album:x'))
    // the grid was left with no text; with some it shows other rows
    expect(p.move(at('albums', 'album:x'), 0, { path: ['albums'], query: 'b' })).toBe('top')
  })

  // ticket 039: the results page is a view below the one it covers
  it('clearing a search shows the view under the results where it was', () => {
    const p = new ScrollPlaces<number>()
    const results = { path: ['albums', 'search'], query: 'harbor' }
    expect(p.move(at('albums'), 900, results)).toBe('top')
    expect(p.move(results, 300, at('albums'))).toBe(900)
  })

  it('"All results" goes back to the results for the same text only', () => {
    const p = new ScrollPlaces<number>()
    const results = (query: string): View => ({ path: ['albums', 'search'], query })
    const all = (query: string): View => ({ path: ['albums', 'search', 'all:songs'], query })
    p.move(results('e'), 400, all('e'))
    expect(p.move(all('e'), 0, results('e'))).toBe(400)
    p.move(results('e'), 400, all('e'))
    p.move(all('e'), 0, all('ex'))
    expect(p.move(all('ex'), 0, results('ex'))).toBe('top')
  })

  it('a place left with other search text starts at the top', () => {
    const p = new ScrollPlaces<number>()
    // a filtered list of playlists, then a playlist opened from it with the text cleared
    p.move({ path: ['playlists'], query: 'road' }, 500, at('playlists', 'pl:1'))
    expect(p.move(at('playlists', 'pl:1'), 0, at('playlists'))).toBe('top')
  })

  it('does not move when the view is the same', () => {
    const p = new ScrollPlaces<number>()
    expect(p.move(at('folders', 'a'), 200, at('folders', 'a'))).toBeUndefined()
    // a search in the same folder moves nothing either, as before
    expect(p.move(at('folders', 'a'), 200, { path: ['folders', 'a'], query: 'x' })).toBeUndefined()
  })
})
