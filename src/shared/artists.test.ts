import { describe, expect, it } from 'vitest'
import { artistKey, listArtists } from './artists'
import type { Album, Track } from './library'
import { defaultPalettes } from './palette'

const tracks = new Map<string, Track>()

// An album by `artist` whose songs are by the given artists (the album's own by default).
function album(id: string, artist: string, songs: (string | undefined)[] = [undefined]): Album {
  const trackIds = songs.map((a, i) => {
    const t: Track = {
      id: `${id}-${i}`,
      title: `Song ${i}`,
      duration: 60,
      albumId: id,
      artist: a ?? artist,
      album: `Album ${id}`,
      no: i + 1,
      disc: 1,
      codec: '',
      folder: 0
    }
    tracks.set(t.id, t)
    return t.id
  })
  return {
    id,
    title: `Album ${id}`,
    artist,
    year: 0,
    palette: defaultPalettes,
    cover: '',
    coverLarge: '',
    trackIds
  }
}

const list = (...albums: Album[]): ReturnType<typeof listArtists> =>
  listArtists(albums, (id) => tracks.get(id)!)

describe('artistKey', () => {
  it('is the same for names that differ only by case or spacing', () => {
    expect(artistKey('AC/DC')).toBe(artistKey('ac / dc'))
    expect(artistKey('Simon  &  Garfunkel')).toBe(artistKey('simon & garfunkel'))
    expect(artistKey('Simon & Garfunkel')).not.toBe(artistKey('Simon and Garfunkel'))
  })
})

describe('listArtists', () => {
  it('lists every album artist, compilations and unknown ones too', () => {
    const out = list(
      album('a', 'Queen'),
      album('b', 'Various Artists', ['Queen', 'Blur']),
      album('c', 'Unknown artist')
    )
    expect(out.map((a) => a.name)).toEqual(['Blur', 'Queen', 'Unknown artist', 'Various Artists'])
    expect(out.find((a) => a.name === 'Various Artists')?.albums).toEqual(['b'])
  })

  it('adds song artists that differ from the album artist, with those songs', () => {
    const [blur, queen] = list(album('a', 'Queen', [undefined, 'Blur']), album('b', 'Blur'))
    expect(queen).toMatchObject({ name: 'Queen', albums: ['a'], also: [] })
    expect(blur).toMatchObject({ name: 'Blur', albums: ['b'], also: ['a-1'] })
  })

  it('keeps joint credits whole', () => {
    const out = list(
      album('a', 'Simon & Garfunkel'),
      album('b', 'Various Artists', ['Paul Simon', 'Drake feat. Rihanna'])
    )
    expect(out.map((a) => a.name)).toEqual([
      'Drake feat. Rihanna',
      'Paul Simon',
      'Simon & Garfunkel',
      'Various Artists'
    ])
  })

  it('merges names that differ by case or spacing, shown the most common way', () => {
    const out = list(
      album('a', 'The Beatles', [undefined, undefined, undefined]),
      album('b', 'the beatles'),
      album('c', 'Various Artists', ['THE  BEATLES'])
    )
    const beatles = out.find((a) => a.key === artistKey('the beatles'))!
    expect(beatles.name).toBe('The Beatles')
    expect(beatles.albums).toEqual(['a', 'b'])
    expect(beatles.also).toEqual(['c-0'])
    expect(out).toHaveLength(2)
  })

  it('counts a song by the album artist in another spelling as part of the album', () => {
    const [a] = list(album('a', 'Blur', ['BLUR']))
    expect(a.also).toEqual([])
  })

  it('returns nothing for an empty library', () => {
    expect(list()).toEqual([])
  })
})
