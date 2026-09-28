import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { caaGroupUrl, parseAnswer, searchUrl } from './cover-sources'
import { pickCandidates, searchKey, type CoverQuery } from './cover-match'

const fixture = (n: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', n), 'utf8'))
const q = (more: Partial<CoverQuery> = {}): CoverQuery => ({
  albumId: 'a1',
  artist: 'The Beatles',
  album: 'Abbey Road',
  year: 1969,
  tracks: 17,
  compilation: false,
  noArtist: false,
  key: searchKey('The Beatles', 'Abbey Road'),
  ...more
})

describe('searchUrl', () => {
  it('puts artist and album in the Deezer query, without quotes from the names', () => {
    const u = new URL(searchUrl('deezer', q({ album: '12" Singles' })))
    expect(u.origin + u.pathname).toBe('https://api.deezer.com/search/album')
    expect(u.searchParams.get('q')).toBe('artist:"beatles" album:"12 singles"')
  })

  it('searches a compilation by album only', () => {
    const u = new URL(searchUrl('deezer', q({ artist: 'Various Artists', compilation: true })))
    expect(u.searchParams.get('q')).toBe('album:"abbey road"')
  })

  it('builds the iTunes and MusicBrainz searches', () => {
    const it = new URL(searchUrl('itunes', q()))
    expect(it.origin + it.pathname).toBe('https://itunes.apple.com/search')
    expect(it.searchParams.get('term')).toBe('beatles abbey road')
    expect(it.searchParams.get('entity')).toBe('album')
    const mb = new URL(searchUrl('musicbrainz', q()))
    expect(mb.origin + mb.pathname).toBe('https://musicbrainz.org/ws/2/release-group')
    expect(mb.searchParams.get('query')).toBe('releasegroup:"abbey road" AND artist:"beatles"')
  })
})

describe('parseAnswer', () => {
  it('reads Deezer albums', () => {
    const got = parseAnswer('deezer', fixture('deezer-album.json'))
    expect(got).toHaveLength(3)
    expect(got[0]).toMatchObject({ artist: 'The Beatles', tracks: 40 })
    expect(got[0].album).toMatch(/Abbey Road/)
    expect(got[0].image).toMatch(/^https:\/\/cdn-images\.dzcdn\.net\/.*1000x1000/)
  })

  it('reads iTunes albums with the big artwork size', () => {
    const [first] = parseAnswer('itunes', fixture('itunes-album.json'))
    expect(first.image).toMatch(/\/1200x1200bb\.jpg$/)
    expect(first).toMatchObject({ artist: 'The Beatles', year: 1969, tracks: 17 })
  })

  it('reads MusicBrainz release groups as Cover Art Archive images', () => {
    const [first] = parseAnswer('musicbrainz', fixture('mb-release-group.json'))
    expect(first).toMatchObject({
      album: 'Abbey Road',
      artist: 'The Beatles',
      year: 1969,
      image: caaGroupUrl('9162580e-5df4-32de-80cc-f45a8d8a9b1d')
    })
  })

  it('finds Abbey Road in each real answer', () => {
    for (const [s, f] of [
      ['deezer', 'deezer-album.json'],
      ['itunes', 'itunes-album.json'],
      ['musicbrainz', 'mb-release-group.json']
    ] as const)
      expect(pickCandidates(q(), parseAnswer(s, fixture(f))).length).toBeGreaterThan(0)
  })

  it('gives nothing for answers of the wrong shape', () => {
    for (const s of ['deezer', 'itunes', 'musicbrainz'] as const) {
      expect(parseAnswer(s, null)).toEqual([])
      expect(parseAnswer(s, [])).toEqual([])
      expect(parseAnswer(s, { data: 'x', results: [1], 'release-groups': [{}] })).toEqual([])
    }
  })
})
