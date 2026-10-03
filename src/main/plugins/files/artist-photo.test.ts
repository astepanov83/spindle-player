import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  artistCandidates,
  artistSearchUrl,
  checkUrl,
  checkedArtist,
  lookUpArtist
} from './artist-photo'

const fixture = (n: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', n), 'utf8'))

const real = {
  id: 2707,
  image:
    'https://cdn-images.dzcdn.net/images/artist/8af19eff0f0bc52edd24e0d19b6e0764/1000x1000-000000-80-0-0.jpg'
}

describe('lookUpArtist', () => {
  it('skips compilations, unknown artists and names with no letters', () => {
    expect(lookUpArtist('Various Artists')).toBe(false)
    expect(lookUpArtist('various')).toBe(false)
    expect(lookUpArtist('VA')).toBe(false)
    expect(lookUpArtist('Unknown artist')).toBe(false)
    expect(lookUpArtist('!!!')).toBe(false)
    expect(lookUpArtist('2 + 2')).toBe(false)
    expect(lookUpArtist('!!! (Chk Chk Chk)')).toBe(true)
    expect(lookUpArtist('Кино')).toBe(true)
  })
})

describe('urls', () => {
  it('searches the artist by the name as written', () => {
    const u = new URL(artistSearchUrl('Simon & Garfunkel'))
    expect(u.origin + u.pathname).toBe('https://api.deezer.com/search/artist')
    expect(u.searchParams.get('q')).toBe('Simon & Garfunkel')
  })

  it('checks by an album or a song with a plain search, with no edition words or quotes', () => {
    const a = new URL(checkUrl('Queen', { kind: 'album', title: 'A Night at the Opera (Deluxe)' }))
    expect(a.pathname).toBe('/search/album')
    expect(a.searchParams.get('q')).toBe('Queen A Night at the Opera')
    const s = new URL(checkUrl('Queen', { kind: 'song', title: 'Bohemian "Rhapsody"' }))
    expect(s.pathname).toBe('/search/track')
    expect(s.searchParams.get('q')).toBe('Queen Bohemian Rhapsody')
  })
})

describe('artistCandidates', () => {
  it('keeps only the same name with a real picture', () => {
    // the second "Simon & Garfunkel" has Deezer's empty picture
    expect(artistCandidates(fixture('deezer-artist.json'), 'Simon & Garfunkel')).toEqual([real])
  })

  it('takes "and" for "&", case and a leading "the" like covers do', () => {
    expect(artistCandidates(fixture('deezer-artist.json'), 'simon and garfunkel')).toEqual([real])
  })

  it('never takes a joint credit or a longer name for one artist', () => {
    const json = {
      data: [
        { id: 1, name: 'Paul Simon & Art Garfunkel', picture_xl: real.image },
        { id: 2, name: 'Simon', picture_xl: real.image }
      ]
    }
    expect(artistCandidates(json, 'Paul Simon')).toEqual([])
    expect(artistCandidates(json, 'Simon & Garfunkel')).toEqual([])
  })

  it('takes nothing from an answer that is not a list', () => {
    expect(artistCandidates({ error: { code: 4 } }, 'Queen')).toEqual([])
    expect(artistCandidates('x', 'Queen')).toEqual([])
  })

  it("drops pictures that are not https on Deezer's image hosts", () => {
    const json = { data: [{ id: 1, name: 'Queen', picture_xl: 'http://example.com/q.jpg' }] }
    expect(artistCandidates(json, 'Queen')).toEqual([])
  })
})

describe('checkedArtist', () => {
  const others = { id: 74334152, image: real.image.replace('8af1', '3f5d') }

  it('picks the candidate whose album has the same title', () => {
    const json = fixture('deezer-artist-album.json')
    const check = { kind: 'album', title: 'Bridge Over Troubled Water' } as const
    expect(checkedArtist(json, check, [others, real])).toEqual(real)
    expect(checkedArtist(json, check, [others])).toBeUndefined()
  })

  it('picks the candidate whose song has the same title', () => {
    const json = fixture('deezer-artist-track.json')
    expect(checkedArtist(json, { kind: 'song', title: 'The Boxer' }, [real])).toEqual(real)
    expect(checkedArtist(json, { kind: 'song', title: 'The Sound of Silence' }, [real])).toBe(
      undefined
    )
  })
  it('picks no one when two candidates have the title, as with a self-titled album', () => {
    const queen = [
      { id: 7, image: real.image.replace('8af1', '0000') },
      { id: 412, image: real.image }
    ]
    const json = {
      data: [
        { title: 'Queen', artist: { id: 7, name: 'Queen' } },
        { title: 'Queen', artist: { id: 412, name: 'Queen' } },
        { title: 'Queen', artist: { id: 412, name: 'Queen' } }
      ]
    }
    expect(checkedArtist(json, { kind: 'album', title: 'Queen' }, queen)).toBeUndefined()
    // the same candidate twice is still one
    expect(
      checkedArtist({ data: json.data.slice(1) }, { kind: 'album', title: 'Queen' }, queen)
    ).toEqual(queen[1])
  })
})
