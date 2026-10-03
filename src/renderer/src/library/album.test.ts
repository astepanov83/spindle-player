import { describe, expect, it } from 'vitest'
import { queueLink } from '../../../shared/saved-queue'
import type { Track } from '../../../shared/library'
import { albumButton, albumLabel, albumLines } from './album'

const track = (id: string, no: number, disc = 1): Track => ({
  id,
  title: id,
  duration: 1,
  albumId: 'al',
  artist: 'A',
  album: 'Al',
  no,
  disc,
  codec: '',
  folder: 0
})

describe('albumLines', () => {
  it('numbers songs by their track tag, with no disc rows for one disc', () => {
    const lines = albumLines([track('a', 1), track('b', 2), track('c', 5)])
    expect(lines).toEqual([
      { track: expect.objectContaining({ id: 'a' }), at: 0, no: 1 },
      { track: expect.objectContaining({ id: 'b' }), at: 1, no: 2 },
      { track: expect.objectContaining({ id: 'c' }), at: 2, no: 5 }
    ])
  })

  it('puts a disc row before each disc when there is more than one', () => {
    const lines = albumLines([track('a', 1), track('b', 2), track('c', 1, 2), track('d', 2, 2)])
    expect(
      lines.map((l) => ('disc' in l ? `Disc ${l.disc}` : `${l.no} ${l.track.id} ${l.at}`))
    ).toEqual(['Disc 1', '1 a 0', '2 b 1', 'Disc 2', '1 c 2', '2 d 3'])
  })

  it('gives a song its place on a disc with no numbers', () => {
    const lines = albumLines([track('a', 0), track('b', 0), track('c', 0, 2)])
    expect(lines.map((l) => ('disc' in l ? `Disc ${l.disc}` : l.no))).toEqual([
      'Disc 1',
      1,
      2,
      'Disc 2',
      1
    ])
  })

  it('shows no number for an untagged song on a disc whose other songs have one', () => {
    // its place would repeat a tagged number
    const lines = albumLines([track('a', 0), track('b', 1), track('c', 2)])
    expect(lines.map((l) => ('disc' in l ? l.disc : l.no))).toEqual([0, 1, 2])
  })

  it('shows no disc row for a one-disc album tagged disc 2', () => {
    expect(albumLines([track('a', 1, 2)]).some((l) => 'disc' in l)).toBe(false)
  })
})

describe('albumLabel', () => {
  it('says Album and the year', () => {
    expect(albumLabel({ artist: 'Marina Vale', year: 2021 })).toBe('Album · 2021')
    expect(albumLabel({ artist: 'Marina Vale', year: 0 })).toBe('Album')
  })

  it('says Compilation for a various artists credit, in any case', () => {
    expect(albumLabel({ artist: 'Various Artists', year: 2021 })).toBe('Compilation · 2021')
    expect(albumLabel({ artist: 'VA', year: 0 })).toBe('Compilation')
    expect(albumLabel({ artist: ' various ', year: 0 })).toBe('Compilation')
  })

  it('goes by the tag when an override renamed the credit', () => {
    expect(albumLabel({ artist: 'Summer DJs', artistTag: 'Various Artists', year: 0 })).toBe(
      'Compilation'
    )
  })
})

describe('albumButton', () => {
  const link = queueLink('album', 'al')
  // the queue came from this album, its song is on, radio is off, nothing ended
  const q = {
    link,
    currentAlbum: 'al',
    ended: false,
    queuePlays: true,
    sounding: true
  }

  it('plays the album from the start when the queue came from elsewhere', () => {
    expect(albumButton('al', { ...q, link: undefined })).toBe('play')
    expect(albumButton('al', { ...q, link: queueLink('album', 'other') })).toBe('play')
    expect(albumButton('al', { ...q, link: queueLink('playlist', 'al') })).toBe('play')
  })

  it('pauses and resumes while the queue is this album', () => {
    expect(albumButton('al', q)).toBe('pause')
    expect(albumButton('al', { ...q, sounding: false })).toBe('resume')
  })

  it('plays the album again while radio has the player', () => {
    expect(albumButton('al', { ...q, queuePlays: false })).toBe('play')
  })

  it('plays the album again once the queue ran out', () => {
    expect(albumButton('al', { ...q, sounding: false, ended: true })).toBe('play')
  })

  it('plays the album when a song added from another album is on', () => {
    // Add to queue keeps the old link
    expect(albumButton('al', { ...q, currentAlbum: 'b' })).toBe('play')
    expect(albumButton('al', { ...q, currentAlbum: undefined })).toBe('play')
  })
})
