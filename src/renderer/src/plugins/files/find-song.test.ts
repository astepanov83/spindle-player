// A song heard on radio found in a made-up library (ticket 119).
import { describe, expect, it } from 'vitest'
import type { Album, Track } from '../../../../shared/library'
import { findIn, songIndex } from './find-song'

const track = (id: string, title: string, artist: string, more: Partial<Track> = {}): Track => ({
  id,
  title,
  duration: 200,
  albumId: 'al',
  artist,
  album: 'Album',
  no: 1,
  disc: 1,
  codec: '',
  folder: 0,
  ...more
})

const tracks = [
  track('t1', 'Powerslave', 'Iron Maiden'),
  track('t2', 'Powerslave (Live)', 'Iron Maiden'),
  track('t3', 'Jóga', 'Björk'),
  track('t4', 'Holy Diver (2005 Remaster)', 'Dio'),
  // artists.json made "Beyoncé" of the tag "Beyonce Knowles"
  track('t5', 'Halo', 'Beyoncé', { artistTag: 'Beyonce Knowles' }),
  // a split credit
  track('t6', 'Under Pressure', 'Queen & David Bowie', { artists: ['Queen', 'David Bowie'] }),
  track('t7', 'Get Lucky', 'Daft Punk'),
  track('t8', 'Powerslave', 'Iron Maiden')
]
const albums = [{ id: 'al', trackIds: tracks.map((t) => t.id) } as Album]
const index = songIndex(albums, (id) => tracks.find((t) => t.id === id)!)
const find = (artist: string, title: string): string | undefined => findIn(index, artist, title)

describe('a song by artist and title', () => {
  it('ignores case, accents and "(Remastered)"', () => {
    expect(find('IRON MAIDEN', 'powerslave')).toBe('t1')
    expect(find('Bjork', 'Joga')).toBe('t3')
    expect(find('Dio', 'Holy Diver')).toBe('t4')
  })

  it('a live version is another song', () => {
    expect(find('Iron Maiden', 'Powerslave (Live)')).toBe('t2')
    expect(find('Iron Maiden', 'Powerslave - Live')).toBe('t2')
  })

  it('by the name artists.json shows, the tag, or one artist of a split credit', () => {
    expect(find('Beyonce', 'Halo')).toBe('t5')
    expect(find('Beyonce Knowles', 'Halo')).toBe('t5')
    expect(find('David Bowie', 'Under Pressure')).toBe('t6')
    expect(find('Queen & David Bowie', 'Under Pressure')).toBe('t6')
  })

  it('a radio artist with a feat is looked for without it', () => {
    expect(find('Daft Punk feat. Pharrell Williams', 'Get Lucky')).toBe('t7')
    expect(find('Daft Punk', 'Get Lucky (feat. Pharrell Williams)')).toBe('t7')
  })

  it('the first in library order wins; another artist or title is not found', () => {
    expect(find('Iron Maiden', 'Powerslave')).toBe('t1')
    expect(find('Dio', 'Powerslave')).toBeUndefined()
    expect(find('Iron Maiden', 'Aces High')).toBeUndefined()
    expect(find('', 'Powerslave')).toBeUndefined()
  })
})
