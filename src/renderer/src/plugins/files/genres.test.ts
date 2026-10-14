// The Genres view's list (ticket 123): grouping, counts, albums and loose songs.
import { describe, expect, it } from 'vitest'
import type { Album, Track } from '../../../../shared/library'
import { defaultPalettes } from '../../../../shared/palette'
import { filterGenres, listGenres, parseGenreSort, sortGenres } from './genres'

const album = (id: string, trackIds: string[]): Album => ({
  id,
  title: id,
  artist: 'Marina Vale',
  year: 0,
  added: 0,
  palette: defaultPalettes,
  cover: '',
  coverLarge: '',
  trackIds
})

const track = (id: string, genre?: string[]): Track => ({
  id,
  title: id,
  duration: 1,
  albumId: id[0],
  artist: 'Marina Vale',
  album: id[0],
  no: 1,
  disc: 1,
  codec: '',
  folder: 0,
  ...(genre ? { genre } : {})
})

// "a": a rock album with one metal song; "b": a compilation, a genre a song;
// "c": rock spelled two ways, and a song with none
const tracks = new Map(
  [
    track('a1', ['Rock']),
    track('a2', ['Rock', 'Metal']),
    track('a3', ['Rock']),
    track('b1', ['Hip-Hop/Rap']),
    track('b2', ['Drum & Bass']),
    track('b3', ['Rock']),
    track('b4'),
    track('c1', ['rock']),
    track('c2')
  ].map((t) => [t.id, t])
)
const albums = [
  album('a', ['a1', 'a2', 'a3']),
  album('b', ['b1', 'b2', 'b3', 'b4']),
  album('c', ['c1', 'c2'])
]
const list = (): ReturnType<typeof listGenres> => listGenres(albums, (id) => tracks.get(id)!)

describe('genres (ticket 123)', () => {
  it('are one per spelling, A-Z, with the spelling most songs use', () => {
    expect(list().map((g) => [g.key, g.name])).toEqual([
      ['drum&bass', 'Drum & Bass'],
      ['hiphop/rap', 'Hip-Hop/Rap'],
      ['metal', 'Metal'],
      ['rock', 'Rock']
    ])
  })

  it('take an album when at least half its songs carry it, else its songs alone', () => {
    const rock = list().find((g) => g.key === 'rock')!
    // c has one of two songs with "rock": half is enough
    expect(rock.albums).toEqual(['a', 'c'])
    expect(rock.also).toEqual(['b3'])
    // the albums' songs, the song with no genre too, and the loose one
    expect(rock.songs).toBe(3 + 2 + 1)
    const metal = list().find((g) => g.key === 'metal')!
    expect(metal).toMatchObject({ albums: [], also: ['a2'], songs: 1 })
    const rap = list().find((g) => g.key === 'hiphop/rap')!
    expect(rap).toMatchObject({ albums: [], also: ['b1'], songs: 1 })
  })

  it('have no entry for songs with no genre', () => {
    const none = new Map([['x1', track('x1')]])
    expect(listGenres([album('x', ['x1'])], (id) => none.get(id)!)).toEqual([])
  })

  it('count a genre once on a song that has it twice', () => {
    const twice = new Map([['x1', track('x1', ['Rock', 'ROCK'])]])
    expect(listGenres([album('x', ['x1'])], (id) => twice.get(id)!)).toMatchObject([
      { name: 'Rock', albums: ['x'], also: [], songs: 1 }
    ])
  })

  it('sort A-Z or by size, and filter by name', () => {
    expect(sortGenres(list(), 'size').map((g) => g.name)).toEqual([
      'Rock',
      'Drum & Bass',
      'Hip-Hop/Rap',
      'Metal'
    ])
    expect(sortGenres(list(), 'name').map((g) => g.name)[0]).toBe('Drum & Bass')
    expect(parseGenreSort('size')).toBe('size')
    expect(parseGenreSort('nope')).toBe('name')
    expect(parseGenreSort(undefined)).toBe('name')
    expect(filterGenres(list(), ' hip ').map((g) => g.name)).toEqual(['Hip-Hop/Rap'])
    expect(filterGenres(list(), '')).toHaveLength(4)
  })
})
