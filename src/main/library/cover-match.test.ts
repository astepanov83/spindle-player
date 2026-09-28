import { describe, expect, it } from 'vitest'
import {
  cleanAlbum,
  cleanArtist,
  pickCandidates,
  searchKey,
  type Candidate,
  type CoverQuery
} from './cover-match'

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
const c = (more: Partial<Candidate> = {}): Candidate => ({
  artist: 'The Beatles',
  album: 'Abbey Road',
  year: 1969,
  tracks: 17,
  image: 'https://x/1.jpg',
  ...more
})

describe('cleanup', () => {
  it('drops edition words in brackets and disc numbers', () => {
    expect(cleanAlbum('Abbey Road (Remastered 2009) [Deluxe Edition]')).toBe('abbey road')
    expect(cleanAlbum('Abbey Road - Remastered 2009')).toBe('abbey road')
    expect(cleanAlbum('Mellon Collie CD1')).toBe('mellon collie')
    expect(cleanAlbum('Mellon Collie (Disc 2)')).toBe('mellon collie')
    expect(cleanAlbum('Abbey Road (2019 Mix)')).toBe('abbey road')
    expect(cleanAlbum('Club Classics (Remix Album)')).toBe('club classics remix album')
  })

  it('keeps brackets that are part of the name', () => {
    expect(cleanAlbum("(What's the Story) Morning Glory?")).toBe('what s the story morning glory')
    expect(cleanAlbum('Pompeii (Live)')).toBe('pompeii live')
  })

  it('treats & as and, drops accents and a leading "the"', () => {
    expect(cleanArtist('The Beatles')).toBe('beatles')
    expect(cleanArtist('Simon & Garfunkel')).toBe(cleanArtist('Simon and Garfunkel'))
    expect(cleanArtist('Björk')).toBe('bjork')
  })

  it('keeps letters of other scripts', () => {
    expect(cleanAlbum('Группа крови')).toBe('группа крови')
    expect(cleanArtist('椎名林檎')).toBe('椎名林檎')
  })
})

describe('pickCandidates', () => {
  it('takes an exact match', () => {
    expect(pickCandidates(q(), [c()])).toHaveLength(1)
  })

  it('matches a deluxe release to the plain tag', () => {
    expect(pickCandidates(q(), [c({ album: 'Abbey Road (Super Deluxe Edition)' })])).toHaveLength(1)
  })

  it('rejects a live album for the studio one', () => {
    expect(pickCandidates(q({ album: 'Pompeii' }), [c({ album: 'Pompeii (Live)' })])).toEqual([])
    expect(pickCandidates(q(), [c({ album: 'Abbey Road Live' })])).toEqual([])
  })

  it('rejects the same album name by another artist', () => {
    expect(pickCandidates(q(), [c({ artist: 'Abbey Road Tribute Band' })])).toEqual([])
  })

  it('accepts the artist as part of a joint credit on word breaks', () => {
    expect(
      pickCandidates(q({ artist: 'Jay-Z' }), [c({ artist: 'Jay-Z & Kanye West' })])
    ).toHaveLength(1)
    expect(pickCandidates(q({ artist: 'Mo' }), [c({ artist: 'Moby' })])).toEqual([])
    expect(
      pickCandidates(q({ artist: 'Drake' }), [c({ artist: 'Drake feat. Rihanna' })])
    ).toHaveLength(1)
    expect(
      pickCandidates(q({ artist: 'Mariah Carey, Boyz II Men' }), [c({ artist: 'Mariah Carey' })])
    ).toHaveLength(1)
  })

  it('rejects another artist whose name holds the whole name', () => {
    // seen on Deezer: an EP by "Кино Фильм" for Кино's "Группа крови"
    const kino = q({ artist: 'Кино', album: 'Группа крови' })
    expect(pickCandidates(kino, [c({ artist: 'Кино Фильм', album: 'Группа крови' })])).toEqual([])
    expect(pickCandidates(q({ artist: 'Queen' }), [c({ artist: 'Queen Latifah' })])).toEqual([])
  })

  it('takes Various Artists for a compilation only', () => {
    const comp = q({ artist: 'Various Artists', compilation: true })
    expect(pickCandidates(comp, [c({ artist: 'Various Artists' })])).toHaveLength(1)
    expect(pickCandidates(q(), [c({ artist: 'Various Artists' })])).toEqual([])
  })

  it('puts the closest year first, then the closest track count', () => {
    const got = pickCandidates(q(), [
      c({ year: 2019, image: 'far' }),
      c({ year: 1969, tracks: 40, image: 'many' }),
      c({ year: 1969, tracks: 17, image: 'best' })
    ])
    expect(got.map((x) => x.image)).toEqual(['best', 'many', 'far'])
  })

  it('drops singles and EPs for an album of 5 songs or more', () => {
    const got = pickCandidates(q({ year: 0 }), [
      c({ kind: 'single', image: 'single' }),
      c({ kind: 'ep', image: 'ep' })
    ])
    expect(got).toEqual([])
  })

  it('puts the album before a single of the same name', () => {
    const got = pickCandidates(q({ year: 0, tracks: 2 }), [
      c({ kind: 'single', year: undefined, tracks: undefined, image: 'single' }),
      c({ kind: 'album', year: undefined, tracks: undefined, image: 'album' })
    ])
    expect(got.map((x) => x.image)).toEqual(['album', 'single'])
  })

  it('never matches an empty name', () => {
    expect(pickCandidates(q({ album: '()' }), [c({ album: '' })])).toEqual([])
    expect(pickCandidates(q({ artist: '!!' }), [c({ artist: '' })])).toEqual([])
  })
})
