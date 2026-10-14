import { describe, expect, it } from 'vitest'
import { commonGenres, genreKey, genreSpellings, genresOf, id3Genres, splitGenre } from './genres'

describe('splitGenre', () => {
  it('always splits at ";", "|" and NUL', () => {
    expect(splitGenre('Rock; Metal')).toEqual(['Rock', 'Metal'])
    expect(splitGenre('Shoegaze|Dream Pop')).toEqual(['Shoegaze', 'Dream Pop'])
    expect(splitGenre('Rock\0Metal')).toEqual(['Rock', 'Metal'])
    // not genre-looking, still two: no genre has a ";"
    expect(splitGenre('Bach;Organ works')).toEqual(['Bach', 'Organ works'])
  })

  it('splits at "," and "/" only between genres', () => {
    expect(splitGenre('Rock, Metal')).toEqual(['Rock', 'Metal'])
    expect(splitGenre('Rock / Metal')).toEqual(['Rock', 'Metal'])
    expect(splitGenre('Electronic/Dance')).toEqual(['Electronic', 'Dance'])
    expect(splitGenre('Swedish Death Metal, Metalcore')).toEqual([
      'Swedish Death Metal',
      'Metalcore'
    ])
    expect(splitGenre('Rock/Pop, Synthwave')).toEqual(['Rock', 'Pop', 'Synthwave'])
  })

  it('keeps names that hold a sign whole', () => {
    expect(splitGenre('Drum & Bass')).toEqual(['Drum & Bass'])
    expect(splitGenre('R&B')).toEqual(['R&B'])
    expect(splitGenre('Rock & Roll, Blues')).toEqual(['Rock & Roll', 'Blues'])
    expect(splitGenre('Hip-Hop/Rap')).toEqual(['Hip-Hop/Rap'])
    expect(splitGenre('Hip Hop/Rap')).toEqual(['Hip Hop/Rap'])
    expect(splitGenre('Folk/Rock')).toEqual(['Folk/Rock'])
    expect(splitGenre('Folk, World, & Country')).toEqual(['Folk, World, & Country'])
    expect(splitGenre('Jazz+Funk')).toEqual(['Jazz+Funk'])
    expect(splitGenre('Rock, Pop/Funk')).toEqual(['Rock', 'Pop/Funk'])
  })

  it('does not split what is not a list of genres', () => {
    expect(splitGenre('AC/DC')).toEqual(['AC/DC'])
    expect(splitGenre('Duo Cello/Piano')).toEqual(['Duo Cello/Piano'])
    expect(splitGenre('Bach, Johann Sebastian')).toEqual(['Bach, Johann Sebastian'])
  })

  it('drops a sign left at the end', () => {
    expect(splitGenre('Rock, ')).toEqual(['Rock'])
    expect(splitGenre('Rock/')).toEqual(['Rock'])
    expect(splitGenre('/')).toEqual(['/'])
  })

  it('turns ID3 numbers into names', () => {
    expect(splitGenre('17')).toEqual(['Rock'])
    expect(splitGenre('(17)')).toEqual(['Rock'])
    expect(splitGenre('(0)')).toEqual(['Blues'])
    expect(splitGenre('(4)Eurodisco')).toEqual(['Disco', 'Eurodisco'])
    expect(splitGenre('(17)(9)')).toEqual(['Rock', 'Metal'])
    expect(splitGenre('(191)')).toEqual(['Psybient'])
    expect(id3Genres).toHaveLength(192)
    // 255 is ID3v1's "none"
    expect(splitGenre('(255)')).toEqual([])
    expect(splitGenre('255')).toEqual([])
    // a year is not a number of the list
    expect(splitGenre('1999')).toEqual(['1999'])
  })

  it('trims, joins spaces and drops empty parts and "Unknown"', () => {
    expect(splitGenre('  Post   Rock  ')).toEqual(['Post Rock'])
    expect(splitGenre(' ; ;Rock;')).toEqual(['Rock'])
    expect(splitGenre('Unknown')).toEqual([])
    expect(splitGenre('<unknown>')).toEqual([])
  })
})

describe('genresOf', () => {
  it('splits every value and keeps each genre once, the first spelling', () => {
    expect(genresOf(['Rock; Metal', 'rock', 'Hip Hop', 'hip-hop'])).toEqual([
      'Rock',
      'Metal',
      'Hip Hop'
    ])
    expect(genresOf(undefined)).toEqual([])
    expect(genresOf([])).toEqual([])
  })

  it('reads one key for spellings of one genre, but not for other signs', () => {
    expect(genreKey('Hip-Hop')).toBe(genreKey('hip hop'))
    expect(genreKey('Post Rock')).toBe(genreKey('Post-Rock'))
    expect(genreKey('Alt. Rock')).toBe(genreKey('alt rock'))
    expect(genreKey('R&B')).not.toBe(genreKey('RB'))
  })
})

describe('commonGenres', () => {
  it('puts the most common first, a tie in the order they come', () => {
    expect(
      commonGenres([['Rock'], ['Pop', 'Rock'], undefined, ['Pop'], ['Rock'], ['Jazz', 'Funk']])
    ).toEqual(['Rock', 'Pop', 'Jazz', 'Funk'])
    expect(commonGenres([undefined, []])).toEqual([])
  })
})

describe('genreSpellings', () => {
  it('spells a genre as most songs do, the first on a tie', () => {
    const spell = genreSpellings([['Rock'], ['rock'], ['Rock'], ['Hip Hop'], ['Hip-Hop']])
    expect(spell('rock')).toBe('Rock')
    expect(spell('ROCK')).toBe('Rock')
    expect(spell('hip-hop')).toBe('Hip Hop')
    expect(spell('Jazz')).toBe('Jazz')
  })
})
